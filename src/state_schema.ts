/**
 * State-schema infrastructure. Each scenario declares the SHAPE of the
 * negotiation state (the `state` field of Propose/CounterPropose, and the
 * `remedy` field of a tribunal Ruling). The orchestrator validates against
 * this schema in sign-time so the bundle is auto-describing and a third-party
 * auditor can verify outcomes without assuming USD or any other domain.
 *
 * Each field declares a runtime zod type AND an aggregation hint (how the
 * jury combines votes for that field — median / majority / intersect / first).
 *
 * The schema also carries an `amendments[]` slot — the explicit, signed
 * extension channel for cláusulas inventadas mid-flight. Agents can introduce
 * fields the schema didn't anticipate via Amend messages whose Accept by the
 * counterparty parks them in `state.amendments[]`.
 */
import { z } from "zod";
import { hash as hashOf } from "./canonical";

export type Aggregation = "median" | "majority" | "intersect" | "first";

export type FieldSpec = {
  /** Zod schema for runtime validation. */
  zod: z.ZodType;
  /** How the tribunal jury aggregates this field across votes. */
  aggregation: Aggregation;
  /** Human-readable description — surfaced in tool input_schemas + UI tooltips. */
  description: string;
  /** Optional override for the JSON Schema fragment (escape hatch for shapes
   *  zod can't easily express, e.g. enums of strings with descriptions). */
  json_schema?: Record<string, unknown>;
};

export type StateSchemaConfig = {
  /** Short domain label, e.g. "USD-credit" or "oncology-coverage". Surfaced
   *  to the jury and the dashboard as ground-truth for what the state is. */
  domain: string;
  /** One-line summary for tooltips and audit reports. */
  description: string;
  fields: Record<string, FieldSpec>;
};

/** A signed, mutually-accepted amendment that extends the state mid-flight.
 *  Lands in `state.amendments[]` when the counterparty Accepts the AmendMsg. */
export type Amendment = {
  key: string;
  value: unknown;
  rationale: string;
  proposed_by_role: "aria" | "atlas";
  proposed_in_round: number;
  accepted_at_round: number;
  /** Hash of the AmendMsg this amendment originated from (for traceability). */
  amend_msg_hash: string;
};

export const AmendmentZod: z.ZodType<Amendment> = z.object({
  key: z.string(),
  value: z.unknown(),
  rationale: z.string(),
  proposed_by_role: z.enum(["aria", "atlas"]),
  proposed_in_round: z.number().int(),
  accepted_at_round: z.number().int(),
  amend_msg_hash: z.string(),
});

export type StateSchemaResult = {
  domain: string;
  description: string;
  /** Compiled zod schema — call `.safeParse(state)` to validate. */
  zodSchema: z.ZodType;
  /** JSON-Schema representation suitable for embedding in tool input_schemas
   *  and the bundle. Fully self-describing — an auditor can read this offline
   *  and know the full shape of every Propose/CounterPropose state. */
  jsonSchema: Record<string, unknown>;
  /** Content-addressed reference: sha256 over the canonical JSON-Schema bytes. */
  ref: string;
  /** Per-field aggregation hints (used by the jury aggregator). */
  aggregations: Record<string, Aggregation>;
};

/** Build a JSON-Schema fragment for an Amendment. Hand-authored to keep the
 *  embedded bundle schema human-readable. */
function amendmentJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      key: { type: "string", description: "Field name introduced by this amendment." },
      value: {
        description: "Free-form value associated with the new field.",
      },
      rationale: { type: "string" },
      proposed_by_role: { type: "string", enum: ["aria", "atlas"] },
      proposed_in_round: { type: "integer" },
      accepted_at_round: { type: "integer" },
      amend_msg_hash: { type: "string" },
    },
    required: [
      "key",
      "value",
      "rationale",
      "proposed_by_role",
      "proposed_in_round",
      "accepted_at_round",
      "amend_msg_hash",
    ],
  };
}

/** Compile a state-schema config into a runtime+JSON-Schema bundle.
 *
 * The compiled schema:
 *   - validates state objects strictly: top-level keys must be in the schema
 *     OR in the `amendments[]` slot. Unknown keys at root are rejected. The
 *     amendment slot is the canonical extension point.
 *   - exposes a JSON-Schema fragment that can be embedded in the bundle and
 *     in the jury's `cast_vote` tool input_schema.
 *   - carries per-field aggregation hints used by the tribunal aggregator.
 */
export function defineStateSchema(config: StateSchemaConfig): StateSchemaResult {
  // Build runtime zod schema.
  const zodShape: Record<string, z.ZodType> = {};
  for (const [name, spec] of Object.entries(config.fields)) {
    zodShape[name] = spec.zod;
  }
  // Always include amendments[] — present (possibly empty) on every state.
  zodShape.amendments = z.array(AmendmentZod).optional().default([]);
  // Strict mode: extra keys are a sign that the agent ignored the schema and
  // tried to smuggle a clause without going through Amend → Accept. Reject.
  const zodSchema = z.object(zodShape).strict();

  // Build hand-authored JSON-Schema (more controllable than zod's auto-converter).
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const aggregations: Record<string, Aggregation> = {};
  for (const [name, spec] of Object.entries(config.fields)) {
    aggregations[name] = spec.aggregation;
    properties[name] = spec.json_schema ?? jsonSchemaFromZod(spec.zod, spec.description);
    // All declared fields are required (non-amendments). Use .optional() in
    // the zod spec if you want to allow omission — but we mark all declared
    // fields as required by default to force agents to be explicit.
    required.push(name);
  }
  properties.amendments = {
    type: "array",
    items: amendmentJsonSchema(),
    description:
      "Mutually-accepted clauses introduced mid-flight via Amend → Accept(counterparty). " +
      "Empty array if none. The schema-strict extension channel — invent fields " +
      "via this slot, never by adding unknown top-level keys.",
  };

  const jsonSchema: Record<string, unknown> = {
    type: "object",
    description: config.description,
    properties,
    required,
    additionalProperties: false,
  };

  const ref = hashOf(jsonSchema);

  return {
    domain: config.domain,
    description: config.description,
    zodSchema,
    jsonSchema,
    ref,
    aggregations,
  };
}

/** Coarse zod → JSON Schema translator. Covers the cases used by Pacta
 *  scenarios: number / string / boolean / array / enum / object. Falls back
 *  to `{}` (any) for shapes outside this set — author your own json_schema
 *  override on the FieldSpec when you need richer constraints. */
function jsonSchemaFromZod(zodType: z.ZodType, description: string): Record<string, unknown> {
  // Try zod v4's native exporter first if available.
  try {
    const maybe = (z as unknown as { toJSONSchema?: (t: unknown) => Record<string, unknown> })
      .toJSONSchema;
    if (typeof maybe === "function") {
      const out = maybe(zodType);
      if (out && typeof out === "object") {
        // Drop the $schema URL if zod added one — Anthropic tool_use chokes on it.
        const cleaned: Record<string, unknown> = { ...out };
        delete cleaned.$schema;
        if (description && !cleaned.description) cleaned.description = description;
        return cleaned;
      }
    }
  } catch {
    // Fall through to manual translation.
  }
  // Manual fallback — best-effort using zod's _def shape.
  const def = (zodType as unknown as { _def?: { typeName?: string } })._def;
  const tn = def?.typeName ?? "";
  if (tn === "ZodNumber") return { type: "number", description };
  if (tn === "ZodString") return { type: "string", description };
  if (tn === "ZodBoolean") return { type: "boolean", description };
  if (tn === "ZodArray") return { type: "array", items: {}, description };
  if (tn === "ZodEnum") return { type: "string", description };
  return { description };
}

/** Aggregate per-field across an array of remedy objects, applying the
 *  scenario's declared aggregation strategy. The jury uses this to combine
 *  the 3 jurors' votes into a single bundled remedy. */
export function aggregateRemedy(
  votes: Array<{ remedy: Record<string, unknown>; confidence: number }>,
  schema: StateSchemaResult,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, agg] of Object.entries(schema.aggregations)) {
    const values = votes
      .map((v) => v.remedy?.[field])
      .filter((v) => v !== undefined && v !== null);
    if (values.length === 0) {
      // No juror provided a value — leave undefined; consumer decides default.
      continue;
    }
    out[field] = aggregateField(values, agg, votes);
  }
  // Jury never proposes amendments — only ratifies what was bilaterally accepted.
  out.amendments = [];
  return out;
}

function aggregateField(
  values: unknown[],
  agg: Aggregation,
  votes: Array<{ confidence: number }>,
): unknown {
  switch (agg) {
    case "median": {
      const nums = values.map(Number).filter((n) => Number.isFinite(n)) as number[];
      if (nums.length === 0) return values[0];
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
        : (sorted[mid] ?? 0);
    }
    case "majority": {
      const counts = new Map<string, number>();
      for (const v of values) {
        const key = JSON.stringify(v);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      let bestKey = JSON.stringify(values[0]);
      let bestCount = 0;
      for (const [k, c] of counts) {
        if (c > bestCount) {
          bestKey = k;
          bestCount = c;
        }
      }
      return JSON.parse(bestKey);
    }
    case "intersect": {
      // Intersection across array values. Strings inside arrays are compared
      // by exact match; objects by JSON stringify.
      const arrays = values.filter(Array.isArray) as unknown[][];
      if (arrays.length === 0) return [];
      const stringify = (x: unknown) =>
        typeof x === "string" ? x : JSON.stringify(x);
      const sets = arrays.map((arr) => new Set(arr.map(stringify)));
      const first = sets[0];
      if (!first) return [];
      const inter: unknown[] = [];
      for (const item of arrays[0]!) {
        const k = stringify(item);
        if (sets.every((s) => s.has(k))) inter.push(item);
      }
      return inter;
    }
    case "first": {
      // Highest-confidence juror's value wins.
      let bestIdx = 0;
      let bestConf = -Infinity;
      for (let i = 0; i < votes.length; i++) {
        if (votes[i]!.confidence > bestConf) {
          bestConf = votes[i]!.confidence;
          bestIdx = i;
        }
      }
      return values[bestIdx] ?? values[0];
    }
  }
}
