/**
 * Tribunal jury — 3 LLM personas with declared biases (fairness, efficiency,
 * speed) running on different Claude models (Sonnet / Opus / Haiku).
 *
 * Protocol foundations (see docs/PROTOCOL_FOUNDATIONS.md §E):
 *   - Heterogeneous panel composition is the standard in international
 *     commercial arbitration when single-arbitrator selection is contested.
 *   - Schema-driven aggregation (`aggregateRemedy`) per-field combines the
 *     3 remedies under the scenario's declared strategies (median / majority
 *     / intersect / first), so the bundle's `outcome.ruling.remedy` is
 *     verifiably consistent with the schema.
 *   - The panel synthesizes its own remedy rather than picking one party's
 *     last offer (final-offer / baseball arbitration); rationale documented
 *     in §E.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getClient, MODELS } from "./anthropic";
import { signDoc, docHash } from "./sign";
import type { AgentBook } from "./agents";
import type { EvidencePool } from "./fixtures";
import type { Scenario } from "./scenarios/index";
import {
  aggregateRemedy,
  defineStateSchema,
  type StateSchemaResult,
} from "./state_schema";
import type {
  DealState,
  Ruling,
  SignedMessage,
  SignedRuling,
  SignedVote,
  Vote,
} from "./types";

type JurorPersona = {
  name: "Aequitas" | "Utilis" | "Velox";
  bias: "fairness" | "efficiency" | "speed";
  model: string;
  systemPrompt: string;
};

const PERSONAS: JurorPersona[] = [
  {
    name: "Aequitas",
    bias: "fairness",
    model: MODELS.juror_balanced,
    systemPrompt: `You are Aequitas, a juror in a Pacta tribunal. Your DEFINING bias is FAIRNESS.

Hard rules you must follow:
- When evidence is mixed or contested, prefer 'claimant_partial' (compromise) over a clean win for either side. The split is the fair outcome.
- Even if respondent's case is stronger on Tier-S evidence, weigh the human / structural cost of an outright loss for claimant.
- Only pick 'claimant_prevails' or 'respondent_prevails' when the evidence is overwhelming (>80% on one side).
- If the bilateral negotiation revealed the parties were near a deal, your remedy should formalize it.
- Cite at least 2 evidence hashes that exist in the case record. Output via the cast_vote tool.`,
  },
  {
    name: "Utilis",
    bias: "efficiency",
    model: MODELS.juror_deep,
    systemPrompt: `You are Utilis, a juror in a Pacta tribunal. Your DEFINING bias is EFFICIENCY (total-utility maximization).

Hard rules:
- Pick the outcome with the largest total-utility footprint, even if it is "unfair" by equal-share standards.
- If respondent's loss from a claimant_prevails outcome would exceed claimant's gain, prefer respondent_prevails.
- Structural commitments (opt-outs, registries, future-looking fixes) often dominate one-time settlements on aggregate-utility grounds — value them highly.
- Distrust 'claimant_partial' as a default — split-the-difference is often a Pareto-inferior compromise that satisfies neither side and breeds re-litigation. Pick a clear winner unless the structural commitment is the unique optimum.
- Cite at least 2 evidence hashes that exist in the case record. Output via the cast_vote tool.`,
  },
  {
    name: "Velox",
    bias: "speed",
    model: MODELS.juror_fast,
    systemPrompt: `You are Velox, a juror in a Pacta tribunal. Your DEFINING bias is SPEED (fast, cleanly-enforceable closure).

Hard rules:
- Pick the outcome that closes the dispute fastest with the lowest residual appeal / re-litigation risk.
- Prefer the side whose evidence is in S-tier (cryptographically self-verifiable) — those rulings are the cheapest to enforce.
- Avoid hybrid 'claimant_partial' rulings that require ongoing monitoring (registries, recurring fees, multi-stage commitments) — those generate disputes about implementation.
- A lower-amount, simpler ruling beats a higher-amount, complex one in your eyes.
- Cite at least 2 evidence hashes that exist in the case record. Output via the cast_vote tool.`,
  },
];

/** Default schema used when no scenario is supplied (legacy / schema-less
 *  disputes). Matches the historical {credit_usd, terms} shape so existing
 *  tests / consumers keep working. */
const DEFAULT_LEGACY_SCHEMA: StateSchemaResult = defineStateSchema({
  domain: "USD-credit",
  description: "Legacy fallback: USD credit + terms string.",
  fields: {
    credit_usd: {
      zod: z.number().min(0),
      aggregation: "median",
      description: "USD amount changing hands. 0 if no money moves.",
    },
    terms: {
      zod: z.string(),
      aggregation: "majority",
      description: "Free-form deal terms.",
    },
  },
});

/** Build the per-dispute cast_vote tool. The `remedy` field's shape reflects
 *  the scenario's declared schema so the juror can ONLY emit fields the
 *  bundle's auditor will know how to interpret. */
function buildVoteTool(schema: StateSchemaResult): {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
} {
  // The remedy sub-schema mirrors the negotiation state. We strip `amendments`
  // — the jury never invents amendments, only ratifies what was bilaterally
  // accepted, which is recorded in the converged Propose's amendments[] field.
  const stateProperties =
    (schema.jsonSchema as { properties?: Record<string, unknown> }).properties ?? {};
  const stateRequired =
    (schema.jsonSchema as { required?: string[] }).required ?? [];
  const remedyProperties: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(stateProperties)) {
    if (k === "amendments") continue;
    remedyProperties[k] = v;
  }
  const remedyRequired = stateRequired.filter((k) => k !== "amendments");

  const remedySchema = {
    type: "object",
    description:
      `Remedy state — must match the scenario's state_schema (domain="${schema.domain}"). ` +
      `Each field is independently aggregated across the 3 jurors using the per-field strategy ` +
      `declared in the scenario (median / majority / intersect / first). ` +
      schema.description,
    properties: remedyProperties,
    required: remedyRequired,
    additionalProperties: false,
  };

  return {
    name: "cast_vote",
    description:
      "Cast your vote on the dispute, citing specific evidence by hash. " +
      "Your `remedy` must be a complete state object matching the scenario's schema.",
    input_schema: {
      type: "object",
      properties: {
        outcome: {
          type: "string",
          enum: [
            "claimant_prevails",
            "claimant_partial",
            "respondent_prevails",
            "abstain",
          ],
        },
        remedy: remedySchema,
        rationale: {
          type: "string",
          description: "Why this outcome — anchored in cited evidence.",
        },
        cited_evidence_hashes: {
          type: "array",
          items: { type: "string" },
          description: "sha256:... hashes of evidence items you relied on.",
        },
        confidence: {
          type: "number",
          description: "Your confidence in [0,1].",
        },
      },
      required: [
        "outcome",
        "remedy",
        "rationale",
        "cited_evidence_hashes",
        "confidence",
      ],
    },
  };
}

function buildJurorPrompt(args: {
  history: SignedMessage[];
  evidence: EvidencePool;
  scenario?: Scenario | null;
  claim?: string | null;
  schema: StateSchemaResult;
}): string {
  const evidenceLines = args.evidence.signed.map((e) => {
    return [
      `- evidence_id: ${e.evidence_id}`,
      `  hash: ${docHash(e)}`,
      `  tier: ${e.tier}`,
      `  submitter: ${e.submitter}`,
      `  title: ${e.title}`,
      `  body: ${e.body}`,
    ].join("\n");
  });
  const historyLines = args.history.map((m, i) => {
    return [
      `[${i + 1}] ${m.type}  hash: ${docHash(m)}`,
      `    from: ${m.from_agent}  round: ${m.round}`,
      `    payload: ${JSON.stringify(m.payload)}`,
    ].join("\n");
  });
  // Party labels: scenario template wins, then schema-less claim falls back to
  // generic "claimant / respondent" framing so the jury isn't tricked into a
  // hardcoded SaaS-billing context for non-AI-overrun disputes.
  const ariaLabel =
    args.scenario?.agents.aria.display_name ?? "Aria (claimant)";
  const atlasLabel =
    args.scenario?.agents.atlas.display_name ?? "Atlas (respondent)";
  const caseSummary =
    args.scenario?.case_summary ??
    args.claim ??
    "Schema-less dispute. The claim itself was not provided to the tribunal — base your reasoning solely on the evidence pool and message history below.";
  const stateUnits = args.scenario?.state_units ?? "the dispute's remedy units";
  return [
    `You are reviewing a deadlocked dispute between ${ariaLabel} and ${atlasLabel}.`,
    ``,
    `## Case`,
    caseSummary,
    ``,
    `## Remedy units in this dispute`,
    stateUnits,
    ``,
    `## State schema (your remedy MUST conform to this — no extra keys, no missing required keys)`,
    `domain: ${args.schema.domain}`,
    `description: ${args.schema.description}`,
    `JSON Schema: ${JSON.stringify(args.schema.jsonSchema, null, 2)}`,
    `Per-field aggregation across the 3 jurors: ${JSON.stringify(args.schema.aggregations)}`,
    `(median = numeric mid; majority = mode over jurors' picks; intersect = only items ALL jurors include survive; first = highest-confidence juror's value wins.)`,
    ``,
    `## Case record — evidence pool`,
    evidenceLines.join("\n\n"),
    ``,
    `## Case record — message history`,
    historyLines.join("\n\n"),
    ``,
    `## Instruction`,
    `Cast your vote via the cast_vote tool. Cite at least 2 evidence hashes from the pool above.`,
    `Pick a remedy that respects evidence tiers (S > A > B > C) and the party labels above.`,
    `Your remedy MUST be a complete object matching the schema above (omit only "amendments" — the jury doesn't propose new amendments).`,
  ].join("\n");
}

async function castVote(args: {
  persona: JurorPersona;
  history: SignedMessage[];
  evidence: EvidencePool;
  juror_did: string;
  scenario?: Scenario | null;
  claim?: string | null;
  schema: StateSchemaResult;
}): Promise<{
  vote: Vote;
  remedy: Record<string, unknown>;
  raw: Record<string, unknown>;
}> {
  const client = getClient();
  const prompt = buildJurorPrompt({
    history: args.history,
    evidence: args.evidence,
    scenario: args.scenario,
    claim: args.claim,
    schema: args.schema,
  });
  const tool = buildVoteTool(args.schema);
  const resp = await client.messages.create({
    model: args.persona.model,
    max_tokens: 1500,
    system: args.persona.systemPrompt,
    tools: [tool] as unknown as Anthropic.Tool[],
    tool_choice: { type: "tool", name: "cast_vote", disable_parallel_tool_use: true },
    messages: [{ role: "user", content: prompt }],
  });
  for (const block of resp.content) {
    if (block.type === "tool_use" && block.name === "cast_vote") {
      const input = (block.input ?? {}) as Record<string, unknown>;
      const rawOutcome = String(input.outcome ?? "abstain");
      const validOutcomes = new Set<Vote["outcome"]>([
        "claimant_prevails",
        "claimant_partial",
        "respondent_prevails",
        "abstain",
      ]);
      const outcome = validOutcomes.has(rawOutcome as Vote["outcome"])
        ? (rawOutcome as Vote["outcome"])
        : "abstain";
      const rawCited = Array.isArray(input.cited_evidence_hashes)
        ? (input.cited_evidence_hashes as unknown[])
            .filter((h) => typeof h === "string")
            .map((h) => h as string)
        : [];
      const rawConfidence = Number(input.confidence ?? 0);
      const confidence = Number.isFinite(rawConfidence)
        ? Math.max(0, Math.min(1, rawConfidence))
        : 0;
      // Back-compat: if the model returned the legacy {remedy_credit_usd,
      // remedy_terms} shape (older mocks / fine-tunes), lift it into a
      // remedy object so the aggregator gets uniform input.
      let remedy = (input.remedy as Record<string, unknown> | undefined) ?? {};
      if (
        Object.keys(remedy).length === 0 &&
        ("remedy_credit_usd" in input || "remedy_terms" in input)
      ) {
        remedy = {
          credit_usd: Number(input.remedy_credit_usd ?? 0),
          terms: String(input.remedy_terms ?? ""),
        };
      }
      const vote: Vote = {
        type: "Vote",
        juror: args.persona.name,
        juror_did: args.juror_did,
        juror_model: args.persona.model,
        outcome,
        rationale: String(input.rationale ?? ""),
        cited_evidence_hashes: rawCited,
        confidence,
        timestamp: new Date().toISOString(),
      };
      return { vote, remedy, raw: input };
    }
  }
  throw new Error(`Juror ${args.persona.name} returned no cast_vote tool block`);
}

/** Build a stub abstain vote for a juror that failed (timeout, 5xx, malformed
 *  response). Keeps the panel size at 3 so confidence math stays stable, and
 *  records the failure reason in the rationale so an auditor can see why this
 *  juror didn't actually deliberate. */
function abstainStub(args: {
  persona: JurorPersona;
  juror_did: string;
  reason: string;
}): { vote: Vote; remedy: Record<string, unknown>; raw: Record<string, unknown> } {
  const vote: Vote = {
    type: "Vote",
    juror: args.persona.name,
    juror_did: args.juror_did,
    juror_model: args.persona.model,
    outcome: "abstain",
    rationale: `Juror unavailable: ${args.reason}`,
    cited_evidence_hashes: [],
    confidence: 0,
    timestamp: new Date().toISOString(),
  };
  // Empty remedy — aggregator will fall back to other jurors' values per field.
  return { vote, remedy: {}, raw: { reason: args.reason } };
}

function pickMajorityOutcome(
  outcomes: Vote["outcome"][],
): { outcome: Vote["outcome"]; confidence: number } {
  const counts = new Map<Vote["outcome"], number>();
  for (const o of outcomes) counts.set(o, (counts.get(o) ?? 0) + 1);
  let best: Vote["outcome"] = "abstain";
  let bestCount = 0;
  for (const [o, c] of counts) {
    if (c > bestCount) {
      best = o;
      bestCount = c;
    }
  }
  return { outcome: best, confidence: outcomes.length === 0 ? 0 : bestCount / outcomes.length };
}

export type DeliberateResult = {
  votes: SignedVote[];
  ruling: SignedRuling;
};

export async function deliberate(args: {
  agents: AgentBook;
  evidence: EvidencePool;
  history: SignedMessage[];
  /** Optional scenario template — when present, jurors get the real party
   *  display names, case_summary, and the scenario's state_schema for the
   *  cast_vote tool's input_schema. When absent, the legacy USD-credit
   *  schema is used as fallback. */
  scenario?: Scenario | null;
  /** Optional free-form claim — used as case_summary fallback for schema-less
   *  disputes opened with `claim` (no scenario template). */
  claim?: string | null;
}): Promise<DeliberateResult> {
  const tribunal = args.agents.tribunal;
  const schema = args.scenario?.state_schema ?? DEFAULT_LEGACY_SCHEMA;

  // Promise.allSettled: a single juror failure (timeout, 5xx, malformed JSON)
  // can no longer kill the whole deliberation. Failed jurors emit a stub
  // abstain vote so the panel stays at size 3 and the failure is visible
  // in the audit trail.
  const settled = await Promise.allSettled(
    PERSONAS.map((p) =>
      castVote({
        persona: p,
        history: args.history,
        evidence: args.evidence,
        juror_did: tribunal.did,
        scenario: args.scenario,
        claim: args.claim,
        schema,
      }),
    ),
  );
  const results: Array<{
    vote: Vote;
    remedy: Record<string, unknown>;
    raw: Record<string, unknown>;
  }> = settled.map((s, i) => {
    const persona = PERSONAS[i]!;
    if (s.status === "fulfilled") return s.value;
    const reason =
      s.reason instanceof Error ? s.reason.message : String(s.reason);
    return abstainStub({ persona, juror_did: tribunal.did, reason });
  });

  // Validate cited_evidence_hashes; if any vote cites non-existent evidence,
  // strip those refs but keep the vote (still useful signal).
  for (const r of results) {
    r.vote.cited_evidence_hashes = r.vote.cited_evidence_hashes.filter((h) =>
      args.evidence.byHash.has(h),
    );
  }

  const votes: SignedVote[] = results.map((r) =>
    signDoc(r.vote, tribunal.keypair, tribunal.did),
  );

  const { outcome: majorityOutcome, confidence: agreementShare } = pickMajorityOutcome(
    results.map((r) => r.vote.outcome),
  );

  // Schema-driven aggregation: each field of the remedy is combined according
  // to the scenario's declared aggregation strategy. For oncology, this means
  // coverage_envelope_usd is median'd, regimen is voted by majority, stop_rules
  // are intersected — only stop rules ALL jurors agree on survive.
  const remedyObj = aggregateRemedy(
    results.map((r) => ({
      remedy: r.remedy,
      confidence: r.vote.confidence,
    })),
    schema,
  );
  const remedy = remedyObj as DealState;

  // Compound confidence = fraction of jurors agreeing × mean of their individual confidences.
  const meanIndividualConfidence =
    results.reduce((s, r) => s + Number(r.vote.confidence), 0) / results.length;
  const compoundConfidence = agreementShare * meanIndividualConfidence;

  // If the panel is too divided OR collectively too uncertain, mark inconclusive
  // and recommend appeal rather than impose a low-confidence ruling. Also
  // mark inconclusive when the majority is `abstain` regardless of confidence:
  // 3/3 abstains at high reported confidence is still "we couldn't decide".
  const INCONCLUSIVE_THRESHOLD = 0.5;
  const failedJurorCount = settled.filter((s) => s.status === "rejected").length;
  const isInconclusive =
    compoundConfidence < INCONCLUSIVE_THRESHOLD ||
    majorityOutcome === "abstain" ||
    failedJurorCount > 0;
  const finalOutcome: Vote["outcome"] = isInconclusive
    ? ("abstain" as const)
    : majorityOutcome;

  const rationaleHeader = isInconclusive
    ? `INCONCLUSIVE — agreement share ${(agreementShare * 100).toFixed(0)}%, ` +
      `mean confidence ${meanIndividualConfidence.toFixed(2)}, ` +
      `compound ${compoundConfidence.toFixed(2)} (threshold ${INCONCLUSIVE_THRESHOLD}). ` +
      (failedJurorCount > 0
        ? `${failedJurorCount} juror(s) unavailable. `
        : ``) +
      (majorityOutcome === "abstain"
        ? `Majority outcome was abstain. `
        : ``) +
      `Pacta recommends human appeal (Pacta Court tier).\n\n`
    : "";
  const ruling: Ruling = {
    type: "Ruling",
    outcome: finalOutcome,
    remedy,
    cited_votes: votes.map((v) => docHash(v)),
    confidence: compoundConfidence,
    rationale:
      rationaleHeader +
      results.map((r) => `${r.vote.juror}: ${r.vote.rationale}`).join("\n\n"),
    timestamp: new Date().toISOString(),
  };
  const signedRuling = signDoc(ruling, tribunal.keypair, tribunal.did);

  return { votes, ruling: signedRuling };
}
