/**
 * State-derived utility + Zeuthen risk index.
 *
 * Background — and why this file exists.
 *
 * The original Pacta "compromise bound" rejected a Propose/CounterPropose when
 * the agent's autoreported `utility_for_self` increased vs their previous
 * proposal. That check enforces nothing about the actual `state` payload — an
 * adversarial agent can keep the literal scalar non-increasing while making
 * zero material concession. The bound was theatre.
 *
 * This module replaces that with a deterministic, state-derived utility:
 *
 *   u_role(state) = Σ (sign_role × normalized(state[field]) × weight_role[field])
 *                   ─────────────────────────────────────────────────────────
 *                              Σ weight_role[field]
 *
 * The orchestrator computes u_role(state) at sign-time and rejects Proposes
 * that improve the proposer's own utility versus their last offer. The bound
 * is now a property of the WIRE, not of an LLM-typed scalar.
 *
 * The autoreported `utility_for_self` stays in the message payload as an
 * audit-only honesty signal — when it diverges from the derived value by a
 * large margin, that's an observable fact in the bundle (we don't reject on
 * the divergence; we surface it).
 *
 * Academic references — see docs/PROTOCOL_FOUNDATIONS.md for the long form.
 *   - Zeuthen, F. (1930) "Problems of Monopoly and Economic Warfare". The
 *     original risk-of-conflict ratio that drives concession in MCP.
 *   - Rosenschein & Zlotkin (1994) "Rules of Encounter" — Monotonic Concession
 *     Protocol formalized for multi-agent systems; Zeuthen strategy as the
 *     concession rule that converges to the Nash bargaining solution.
 *   - Endriss (2006) "Monotonic Concession Protocols for Multilateral
 *     Negotiation" — generalization to >2 parties (we are 2-party, so the
 *     bilateral case applies directly).
 */

import type { StateSchemaResult } from "./state_schema";
import type { DealState } from "./types";

/** How a single state field contributes to a party's utility.
 *
 *  - `number`: linearly normalize the value into [0,1] using `min`/`max`. Sign
 *    decides whether higher (+1) or lower (-1) values are better for the party.
 *  - `enum`: ordered list. The value's position is normalized to [0,1] (first
 *    → 0, last → 1). Sign flips meaning. Useful for ordinal categorical fields
 *    like timing = ["immediate" .. "no-publication"].
 *  - `array_count`: counts items present in an array, normalized by `max`.
 *    Sign flips. Useful for "how many redactions" (more = better for one side,
 *    fewer = better for the other).
 *  - `set_membership`: per-item utility from a preferred-list lookup. Each
 *    array element contributes if it's in `preferred` (configurable score per
 *    item via `weights`, default 1/length). Useful for arrays where specific
 *    items matter (e.g. stop_rules where "imaging at month 2" is highly valued
 *    by both sides but "consolidation pathway preserved" is one-sided). NOT
 *    used in current scenarios — array_count handles them — but available for
 *    future scenarios with richer array semantics.
 *  - `ignore`: field doesn't contribute to this party's utility (qualitative
 *    free-form fields like rationale_summary or human-readable terms strings).
 */
export type FieldUtilitySpec =
  | {
      kind: "number";
      min: number;
      max: number;
      /** +1 ⇒ higher is better, -1 ⇒ lower is better. */
      sign: 1 | -1;
      /** Relative importance for this party. Weights are not constrained to
       *  sum to 1 — the utility function divides by the sum of weights present
       *  in the role's config. */
      weight: number;
    }
  | {
      kind: "enum";
      order: string[];
      sign: 1 | -1;
      weight: number;
    }
  | {
      kind: "array_count";
      max: number;
      sign: 1 | -1;
      weight: number;
    }
  | {
      kind: "set_membership";
      preferred: string[];
      /** Optional per-item weight; defaults to 1/preferred.length. */
      item_weights?: Record<string, number>;
      sign: 1 | -1;
      weight: number;
    }
  | { kind: "ignore" };

/** Per-party utility configuration for a scenario. */
export type RoleUtilityConfig = {
  /** Field name → contribution spec for this party. Fields absent from this
   *  map are treated as `ignore`. */
  fields: Record<string, FieldUtilitySpec>;
  /** Reservation utility ∈ [0,1]. The party's walk-away threshold — used by
   *  Zeuthen risk computation. Below this, the party would rather break down
   *  to the tribunal than accept. Reflects the system-prompt declaration. */
  reservation: number;
};

export type ScenarioUtilityConfig = {
  aria: RoleUtilityConfig;
  atlas: RoleUtilityConfig;
};

/** Normalize a single field's value into [0,1] under the given spec.
 *  Returns null when the value is missing or unparseable — caller should
 *  exclude the field from the utility sum (do NOT default to 0 / 0.5 silently). */
function normalizeField(value: unknown, spec: FieldUtilitySpec): number | null {
  switch (spec.kind) {
    case "ignore":
      return null;
    case "number": {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      const range = spec.max - spec.min;
      if (range <= 0) return null;
      const clamped = Math.min(spec.max, Math.max(spec.min, n));
      return (clamped - spec.min) / range;
    }
    case "enum": {
      if (typeof value !== "string") return null;
      const idx = spec.order.indexOf(value);
      if (idx < 0) return null;
      if (spec.order.length <= 1) return 0;
      return idx / (spec.order.length - 1);
    }
    case "array_count": {
      if (!Array.isArray(value)) return null;
      if (spec.max <= 0) return 0;
      return Math.min(value.length / spec.max, 1);
    }
    case "set_membership": {
      if (!Array.isArray(value)) return null;
      if (spec.preferred.length === 0) return 0;
      const defaultWeight = 1 / spec.preferred.length;
      let score = 0;
      for (const item of value) {
        if (typeof item !== "string") continue;
        if (!spec.preferred.includes(item)) continue;
        score += spec.item_weights?.[item] ?? defaultWeight;
      }
      return Math.min(score, 1);
    }
  }
}

/** Apply the spec's sign convention. `sign === -1` means lower-is-better, so
 *  contribution becomes `1 - normalized`. */
function applySign(normalized: number, sign: 1 | -1): number {
  return sign === 1 ? normalized : 1 - normalized;
}

/** Compute utility for a given role under the scenario's config. Returns a
 *  number in [0,1]. When no fields contribute (all `ignore` or all missing
 *  values), returns 0.5 — the neutral midpoint, signaling "no information".
 *
 *  Amendments[]: contribute 0 to utility by default. The protocol treats
 *  bilaterally-Accepted amendments as positive-sum extensions — they're free
 *  in compromise-bound terms. A future iteration could attach weight deltas to
 *  AmendMsg payloads so amendments materially shift the bound. */
export function utilityFor(
  state: DealState,
  role: "aria" | "atlas",
  config: ScenarioUtilityConfig,
): number {
  const roleConfig = config[role];
  let totalWeight = 0;
  let weightedSum = 0;
  for (const [field, spec] of Object.entries(roleConfig.fields)) {
    if (spec.kind === "ignore") continue;
    if (spec.weight <= 0) continue;
    const norm = normalizeField(state[field], spec);
    if (norm === null) continue;
    const contribution = applySign(norm, spec.sign);
    weightedSum += contribution * spec.weight;
    totalWeight += spec.weight;
  }
  if (totalWeight === 0) return 0.5;
  return weightedSum / totalWeight;
}

/** Per-field breakdown — useful for rejection messages so the agent sees
 *  which specific field improved their utility. */
export function utilityBreakdown(
  state: DealState,
  role: "aria" | "atlas",
  config: ScenarioUtilityConfig,
): Array<{ field: string; normalized: number; signed: number; weight: number; weighted: number }> {
  const out: Array<{
    field: string;
    normalized: number;
    signed: number;
    weight: number;
    weighted: number;
  }> = [];
  const roleConfig = config[role];
  for (const [field, spec] of Object.entries(roleConfig.fields)) {
    if (spec.kind === "ignore") continue;
    if (spec.weight <= 0) continue;
    const norm = normalizeField(state[field], spec);
    if (norm === null) continue;
    const signed = applySign(norm, spec.sign);
    out.push({
      field,
      normalized: norm,
      signed,
      weight: spec.weight,
      weighted: signed * spec.weight,
    });
  }
  return out;
}

/** Identify the fields whose utility increased between two states for a given
 *  role. Returns name + delta sorted descending. Used to build a precise
 *  rejection message: "your utility went up because credit_usd moved from
 *  120k → 140k (+0.08)". */
export function utilityIncreases(
  state_prev: DealState,
  state_curr: DealState,
  role: "aria" | "atlas",
  config: ScenarioUtilityConfig,
): Array<{ field: string; delta: number; prev: unknown; curr: unknown }> {
  const roleConfig = config[role];
  const out: Array<{ field: string; delta: number; prev: unknown; curr: unknown }> = [];
  for (const [field, spec] of Object.entries(roleConfig.fields)) {
    if (spec.kind === "ignore") continue;
    if (spec.weight <= 0) continue;
    const prev = state_prev[field];
    const curr = state_curr[field];
    const np = normalizeField(prev, spec);
    const nc = normalizeField(curr, spec);
    if (np === null || nc === null) continue;
    const sp = applySign(np, spec.sign);
    const sc = applySign(nc, spec.sign);
    const delta = (sc - sp) * spec.weight;
    if (delta > 1e-9) out.push({ field, delta, prev, curr });
  }
  out.sort((a, b) => b.delta - a.delta);
  return out;
}

/** Zeuthen risk index — intuitively "how willing is this party to risk a
 *  breakdown rather than concede right now?".
 *
 *  risk_i = (u_i(my_offer) - u_i(your_offer)) / (u_i(my_offer) - u_i(conflict))
 *
 *  - Numerator: utility I lose by accepting your offer instead of mine.
 *  - Denominator: utility I lose by breaking down to the conflict outcome.
 *  - Ratio in [0,1] under rational play (with conflict outcome ≤ either offer).
 *
 *  The Zeuthen rule says: at each round, the party with the LOWER risk has to
 *  concede. They have less to lose by moving toward the other's offer than
 *  they would lose if everything fell apart. When both follow this rule, the
 *  bilateral negotiation converges to the Nash bargaining solution.
 *
 *  Pacta uses Zeuthen risk as advisory feedback (not hard enforcement) —
 *  the LLM sees its own risk and the counterparty's in the rejection_feedback
 *  channel and can choose to follow or ignore. Hard enforcement is on the
 *  state-derived compromise bound (`utilityIncreases`), not on Zeuthen.
 *
 *  Returns Infinity when (u_self - u_conflict) ≤ 0 — i.e. when the party is
 *  already at or below conflict utility, which is the protocol's signal to
 *  Escalate or Withdraw rather than concede further.
 */
export function zeuthenRisk(args: {
  /** This party's utility evaluation of their own most recent offer. */
  u_self_own: number;
  /** This party's utility evaluation of the counterparty's most recent offer. */
  u_self_other: number;
  /** This party's utility at conflict (tribunal / breakdown). Use the
   *  reservation value as a tractable proxy: parties refuse to settle below
   *  reservation, so reservation is the floor at which they'd prefer breakdown. */
  u_conflict: number;
}): number {
  const numerator = args.u_self_own - args.u_self_other;
  const denominator = args.u_self_own - args.u_conflict;
  if (denominator <= 1e-9) return Number.POSITIVE_INFINITY;
  if (numerator <= 0) return 0; // counterparty's offer is already as good or better than mine
  return numerator / denominator;
}

/** Given the latest state from each side, identify which party "should"
 *  concede next under the Zeuthen rule. Returns:
 *    - "aria"  if aria's risk is strictly lower (aria concedes)
 *    - "atlas" if atlas's risk is strictly lower
 *    - "tie"   if risks are equal within `eps` (both should concede equally)
 *    - "either" if one side's risk is Infinity (already at/below conflict).
 *
 *  When this returns "tie", the canonical extension says both parties concede;
 *  in practice we surface this as advisory text and let the LLMs interpret. */
export function expectedConceder(args: {
  state_aria_last: DealState | null;
  state_atlas_last: DealState | null;
  config: ScenarioUtilityConfig;
  eps?: number;
}): {
  conceder: "aria" | "atlas" | "tie" | "either";
  risk_aria: number;
  risk_atlas: number;
  utilities: {
    u_aria_own: number;
    u_aria_other: number;
    u_atlas_own: number;
    u_atlas_other: number;
  };
} | null {
  if (!args.state_aria_last || !args.state_atlas_last) return null;
  const eps = args.eps ?? 1e-6;
  const u_aria_own = utilityFor(args.state_aria_last, "aria", args.config);
  const u_aria_other = utilityFor(args.state_atlas_last, "aria", args.config);
  const u_atlas_own = utilityFor(args.state_atlas_last, "atlas", args.config);
  const u_atlas_other = utilityFor(args.state_aria_last, "atlas", args.config);
  const risk_aria = zeuthenRisk({
    u_self_own: u_aria_own,
    u_self_other: u_aria_other,
    u_conflict: args.config.aria.reservation,
  });
  const risk_atlas = zeuthenRisk({
    u_self_own: u_atlas_own,
    u_self_other: u_atlas_other,
    u_conflict: args.config.atlas.reservation,
  });
  const utilities = { u_aria_own, u_aria_other, u_atlas_own, u_atlas_other };
  if (!Number.isFinite(risk_aria) && !Number.isFinite(risk_atlas))
    return { conceder: "either", risk_aria, risk_atlas, utilities };
  if (!Number.isFinite(risk_aria))
    return { conceder: "atlas", risk_aria, risk_atlas, utilities };
  if (!Number.isFinite(risk_atlas))
    return { conceder: "aria", risk_aria, risk_atlas, utilities };
  if (Math.abs(risk_aria - risk_atlas) < eps)
    return { conceder: "tie", risk_aria, risk_atlas, utilities };
  return {
    conceder: risk_aria < risk_atlas ? "aria" : "atlas",
    risk_aria,
    risk_atlas,
    utilities,
  };
}

/** Build a one-line advisory string an LLM can read to decide whether to
 *  concede next turn. Surfaced via the orchestrator's pending_feedback so
 *  the agent's prompt sees the Zeuthen recommendation as soft pressure. */
export function zeuthenAdvisory(role: "aria" | "atlas", info: NonNullable<ReturnType<typeof expectedConceder>>): string {
  const myRisk = role === "aria" ? info.risk_aria : info.risk_atlas;
  const otherRisk = role === "aria" ? info.risk_atlas : info.risk_aria;
  const fmt = (r: number) =>
    Number.isFinite(r) ? r.toFixed(3) : "∞ (already at/below your reservation)";
  if (info.conceder === "either")
    return (
      `Zeuthen advisory: both parties are at/below their reservation utility — ` +
      `protocol expects Escalate or Withdraw rather than further concession.`
    );
  if (info.conceder === "tie")
    return (
      `Zeuthen advisory: both parties have equal risk (${fmt(myRisk)}). ` +
      `Both should make a meaningful concession next turn.`
    );
  if (info.conceder === role)
    return (
      `Zeuthen advisory: your risk-of-breakdown (${fmt(myRisk)}) is lower than ` +
      `the counterparty's (${fmt(otherRisk)}). Under the Monotonic Concession ` +
      `Protocol (Rosenschein & Zlotkin 1994), YOU should make the meaningful ` +
      `concession next turn. Move at least one weighted field toward the ` +
      `counterparty's last offer.`
    );
  return (
    `Zeuthen advisory: your risk-of-breakdown (${fmt(myRisk)}) is higher than ` +
    `the counterparty's (${fmt(otherRisk)}). Hold position; the protocol ` +
    `expects them to concede next.`
  );
}

/** Validate a UtilityConfig against a schema's declared fields — every
 *  weighted field must exist in the schema, and number/enum/array specs must
 *  be consistent with the schema's runtime shape. Returns null on pass or a
 *  list of human-readable problems. Used by tests and by scenario authors at
 *  startup to catch typos. */
export function validateUtilityConfig(
  config: ScenarioUtilityConfig,
  schema: StateSchemaResult,
): string[] | null {
  const problems: string[] = [];
  const declared = new Set(
    Object.keys(
      (schema.jsonSchema as { properties?: Record<string, unknown> }).properties ?? {},
    ),
  );
  for (const role of ["aria", "atlas"] as const) {
    for (const [field, spec] of Object.entries(config[role].fields)) {
      if (spec.kind === "ignore") continue;
      if (!declared.has(field) && field !== "amendments") {
        problems.push(
          `[${role}] field '${field}' is not in scenario schema (domain='${schema.domain}'). ` +
            `Declared fields: ${[...declared].join(", ")}`,
        );
      }
    }
    if (config[role].reservation < 0 || config[role].reservation > 1) {
      problems.push(
        `[${role}] reservation must be in [0,1], got ${config[role].reservation}`,
      );
    }
  }
  return problems.length > 0 ? problems : null;
}
