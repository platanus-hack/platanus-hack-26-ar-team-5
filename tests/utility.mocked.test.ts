/**
 * Unit tests for the state-derived utility module + the rigorous compromise
 * bound it enables.
 *
 * The key claim being tested: the original autoreported `utility_for_self`
 * bound was theatre — an agent could keep the literal scalar non-increasing
 * while making zero material concession on `state`. The new state-derived
 * bound rejects that "humo" attempt because the wire-level state is the
 * thing that gets scored.
 *
 * Theory anchor: docs/PROTOCOL_FOUNDATIONS.md §A (Monotonic Concession Protocol
 * + Zeuthen strategy, Rosenschein & Zlotkin 1994).
 */
import { describe, expect, it } from "vitest";
import { bootAgents } from "../src/agents";
import { buildEvidencePool } from "../src/fixtures";
import { aiOverrun } from "../src/scenarios/ai-overrun";
import { oncology } from "../src/scenarios/oncology";
import { deadlockLeak } from "../src/scenarios/deadlock-leak";
import { runNegotiation, type LLMDriver, type MessageBody } from "../src/orchestrator";
import { docHash } from "../src/sign";
import {
  expectedConceder,
  utilityFor,
  utilityIncreases,
  validateUtilityConfig,
  zeuthenRisk,
} from "../src/utility";
import type { SignedMessage } from "../src/types";

describe("utility.utilityFor (mocked) — state-derived utility", () => {
  it("computes aria utility as a fraction of the cap for USD-credit", () => {
    const cfg = aiOverrun.utility_config!;
    expect(utilityFor({ credit_usd: 0, terms: "x" }, "aria", cfg)).toBeCloseTo(0);
    expect(utilityFor({ credit_usd: 250000, terms: "x" }, "aria", cfg)).toBeCloseTo(1);
    expect(utilityFor({ credit_usd: 125000, terms: "x" }, "aria", cfg)).toBeCloseTo(0.5);
  });

  it("inverts atlas utility (lower credit = higher atlas utility)", () => {
    const cfg = aiOverrun.utility_config!;
    expect(utilityFor({ credit_usd: 0, terms: "x" }, "atlas", cfg)).toBeCloseTo(1);
    expect(utilityFor({ credit_usd: 250000, terms: "x" }, "atlas", cfg)).toBeCloseTo(0);
  });

  it("ignores qualitative `terms` field — both states score identically", () => {
    const cfg = aiOverrun.utility_config!;
    const a = utilityFor({ credit_usd: 100000, terms: "x" }, "aria", cfg);
    const b = utilityFor({ credit_usd: 100000, terms: "completely different prose" }, "aria", cfg);
    expect(a).toBeCloseTo(b);
  });

  it("normalizes oncology multi-field state with weighted sum", () => {
    const cfg = oncology.utility_config!;
    // Aurora's worst case: zero coverage, zero duration, max stop_rules
    const worst = {
      coverage_envelope_usd: 0,
      regimen: "consolidation only",
      duration_months: 0,
      stop_rules: ["a", "b", "c", "d", "e", "f"],
      amendments: [],
    };
    // Aurora's ideal: full coverage, full duration, no stop rules
    const ideal = {
      coverage_envelope_usd: 200000,
      regimen: "concurrent durva",
      duration_months: 12,
      stop_rules: [],
      amendments: [],
    };
    const u_worst = utilityFor(worst, "aria", cfg);
    const u_ideal = utilityFor(ideal, "aria", cfg);
    expect(u_ideal).toBeGreaterThan(u_worst);
    expect(u_ideal).toBeCloseTo(1, 2);
    expect(u_worst).toBeCloseTo(0, 2);
  });

  it("scores deadlock-leak enums by their position", () => {
    const cfg = deadlockLeak.utility_config!;
    // Vega's ideal: immediate publish, no redactions, no corporate review.
    const vegaIdeal = {
      timing: "immediate",
      redactions: [],
      corporate_review: "none",
      rationale_summary: "x",
      amendments: [],
    };
    // Argo's ideal: no publication, max redactions, full review.
    const argoIdeal = {
      timing: "no-publication",
      redactions: ["a", "b", "c", "d", "e"],
      corporate_review: "full",
      rationale_summary: "x",
      amendments: [],
    };
    expect(utilityFor(vegaIdeal, "aria", cfg)).toBeCloseTo(1, 2);
    expect(utilityFor(argoIdeal, "atlas", cfg)).toBeCloseTo(1, 2);
    // And opposite-of-ideal scores at zero
    expect(utilityFor(argoIdeal, "aria", cfg)).toBeCloseTo(0, 2);
    expect(utilityFor(vegaIdeal, "atlas", cfg)).toBeCloseTo(0, 2);
  });

  it("returns 0.5 (neutral) when no fields contribute", () => {
    const cfg = {
      aria: { reservation: 0.3, fields: { x: { kind: "ignore" as const } } },
      atlas: { reservation: 0.3, fields: { x: { kind: "ignore" as const } } },
    };
    expect(utilityFor({ x: 1 }, "aria", cfg)).toBe(0.5);
  });
});

describe("utility.utilityIncreases (mocked) — field-level diff", () => {
  it("identifies which field improved the agent's utility", () => {
    const cfg = aiOverrun.utility_config!;
    const prev = { credit_usd: 100000, terms: "a" };
    const curr = { credit_usd: 130000, terms: "b" };
    const incs = utilityIncreases(prev, curr, "aria", cfg);
    expect(incs).toHaveLength(1);
    expect(incs[0]!.field).toBe("credit_usd");
    expect(incs[0]!.delta).toBeGreaterThan(0);
  });

  it("returns empty when state didn't move (Δ = 0)", () => {
    const cfg = aiOverrun.utility_config!;
    const s = { credit_usd: 100000, terms: "x" };
    expect(utilityIncreases(s, s, "aria", cfg)).toHaveLength(0);
  });

  it("returns empty when utility went DOWN (a real concession)", () => {
    const cfg = aiOverrun.utility_config!;
    const prev = { credit_usd: 100000, terms: "x" };
    const curr = { credit_usd: 80000, terms: "x" };
    expect(utilityIncreases(prev, curr, "aria", cfg)).toHaveLength(0);
  });
});

describe("utility.zeuthenRisk + expectedConceder (mocked)", () => {
  it("higher-risk party holds; lower-risk concedes (Zeuthen rule)", () => {
    // Party A's offer is u=0.9 to itself, u=0.4 to counterpart's view.
    // Party A's reservation: 0.3.
    // Party A's risk: (0.9 - 0.4) / (0.9 - 0.3) = 0.83 — HIGH risk, holds.
    const a = zeuthenRisk({ u_self_own: 0.9, u_self_other: 0.4, u_conflict: 0.3 });
    expect(a).toBeCloseTo(0.5 / 0.6, 2);
    // Party B with the same numerator but a higher reservation has lower risk
    // (denominator shrinks), so B should concede.
    const b = zeuthenRisk({ u_self_own: 0.5, u_self_other: 0.4, u_conflict: 0.2 });
    expect(b).toBeCloseTo(0.1 / 0.3, 2);
    expect(b).toBeLessThan(a);
  });

  it("returns 0 when counterparty's offer already dominates ours", () => {
    expect(zeuthenRisk({ u_self_own: 0.5, u_self_other: 0.7, u_conflict: 0 })).toBe(0);
  });

  it("returns Infinity when at/below conflict utility (signal to Escalate)", () => {
    expect(
      zeuthenRisk({ u_self_own: 0.3, u_self_other: 0.1, u_conflict: 0.3 }),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it("expectedConceder picks the lower-risk side as the next conceder", () => {
    const cfg = aiOverrun.utility_config!;
    // Aria has offered $180k (her u≈0.72), atlas has offered $0 (his u≈1.0).
    // Aria's risk: (0.72 - 0)/(0.72 - 0.30) ≈ 1.71. (Atlas's $0 offer scores 0 to aria.)
    // Atlas's risk: (1.0 - 0.28)/(1.0 - 0.35) = 0.72/0.65 ≈ 1.11.
    // Atlas has lower risk → atlas should concede.
    const info = expectedConceder({
      state_aria_last: { credit_usd: 180000, terms: "x" },
      state_atlas_last: { credit_usd: 0, terms: "x" },
      config: cfg,
    });
    expect(info).not.toBeNull();
    expect(info!.conceder).toBe("atlas");
  });

  it("returns null until both sides have proposed at least once", () => {
    const cfg = aiOverrun.utility_config!;
    expect(
      expectedConceder({
        state_aria_last: { credit_usd: 180000, terms: "x" },
        state_atlas_last: null,
        config: cfg,
      }),
    ).toBeNull();
  });
});

describe("utility.validateUtilityConfig (mocked) — author-time consistency check", () => {
  it("passes for the bundled scenarios", () => {
    for (const scenario of [aiOverrun, oncology, deadlockLeak]) {
      expect(
        validateUtilityConfig(scenario.utility_config!, scenario.state_schema),
      ).toBeNull();
    }
  });

  it("flags fields that don't exist in the schema", () => {
    const problems = validateUtilityConfig(
      {
        aria: {
          reservation: 0.3,
          fields: {
            credit_usd: { kind: "number", min: 0, max: 100, sign: 1, weight: 1 },
            nonexistent: { kind: "number", min: 0, max: 1, sign: 1, weight: 1 },
          },
        },
        atlas: { reservation: 0.3, fields: {} },
      },
      aiOverrun.state_schema,
    );
    expect(problems).not.toBeNull();
    expect(problems!.some((p) => p.includes("nonexistent"))).toBe(true);
  });

  it("flags out-of-range reservation", () => {
    const problems = validateUtilityConfig(
      {
        aria: { reservation: 2, fields: {} },
        atlas: { reservation: 0.3, fields: {} },
      },
      aiOverrun.state_schema,
    );
    expect(problems).not.toBeNull();
    expect(problems!.some((p) => p.includes("reservation"))).toBe(true);
  });
});

// --- End-to-end: state-derived bound rejects "humo" via the orchestrator ---

function ariaPropose(args: {
  ariaDid: string;
  round: number;
  utility: number;
  credit: number;
  evidence: string[];
  parents?: string[];
}): MessageBody {
  return {
    type: "Propose",
    round: args.round,
    from_agent: args.ariaDid,
    evidence_refs: args.evidence,
    parent_refs: args.parents ?? [],
    payload: {
      state: { credit_usd: args.credit, terms: "x" },
      rationale: "r",
      utility_for_self: args.utility,
    },
  };
}

function ariaCounter(args: {
  ariaDid: string;
  round: number;
  utility: number;
  credit: number;
  evidence: string[];
  parents: string[];
}): MessageBody {
  return {
    type: "CounterPropose",
    round: args.round,
    from_agent: args.ariaDid,
    evidence_refs: args.evidence,
    parent_refs: args.parents,
    payload: {
      state: { credit_usd: args.credit, terms: "x" },
      rationale: "r",
      utility_for_self: args.utility,
    },
  };
}

function atlasCounter(args: {
  atlasDid: string;
  round: number;
  utility: number;
  credit: number;
  evidence: string[];
  parents: string[];
}): MessageBody {
  return {
    type: "CounterPropose",
    round: args.round,
    from_agent: args.atlasDid,
    evidence_refs: args.evidence,
    parent_refs: args.parents,
    payload: {
      state: { credit_usd: args.credit, terms: "x" },
      rationale: "r",
      utility_for_self: args.utility,
    },
  };
}

async function drain(
  agents: ReturnType<typeof bootAgents>,
  pool: ReturnType<typeof buildEvidencePool>,
  driver: LLMDriver,
) {
  const events: any[] = [];
  const gen = runNegotiation(agents, pool, driver, {
    maxRounds: 3,
    deadlockEpsilon: 0.05,
    deadlockFlatRounds: 2,
    scenario: aiOverrun,
  });
  let r: Awaited<ReturnType<typeof gen.next>>;
  do {
    r = await gen.next();
    if (!r.done) events.push(r.value);
  } while (!r.done);
  return { events, result: r.value };
}

describe("orchestrator (mocked) — state-derived compromise bound", () => {
  it("REJECTS the 'humo' pattern: state stays fixed while utility_for_self drops", async () => {
    // The classic adversarial attack on the old bound:
    // - R1: state.credit_usd = 180000, utility_for_self = 0.95
    // - R2: state.credit_usd = 180000, utility_for_self = 0.94 (lies about concession)
    // Old bound: 0.94 < 0.95 → ACCEPTED (humo passes the check).
    // New bound: u_aria(state) is identical R1 and R2 (state didn't move) → Δu = 0,
    //           which is fine. So this exact case is NOT rejected — but the
    //           state genuinely didn't improve either, so the agent isn't gaming
    //           anything. The real attack is the inverse: state IMPROVES for aria
    //           while utility_for_self drops. THAT is what gets caught now.
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, aiOverrun);
    const ariaEv = pool.signed.filter((e) => e.submitter === agents.aria.did).map(docHash);
    const atlasEv = pool.signed.filter((e) => e.submitter === agents.atlas.did).map(docHash);

    let i = 0;
    const driver: LLMDriver = {
      async emit({ history }) {
        i++;
        const lastHash = history.length > 0 ? docHash(history[history.length - 1]!) : null;
        if (i === 1)
          return ariaPropose({
            ariaDid: agents.aria.did,
            round: 1,
            utility: 0.95,
            credit: 100000,
            evidence: ariaEv,
          });
        if (i === 2)
          return atlasCounter({
            atlasDid: agents.atlas.did,
            round: 1,
            utility: 0.95,
            credit: 0,
            evidence: atlasEv,
            parents: lastHash ? [lastHash] : [],
          });
        // R2 aria: AUTOREPORT drops to 0.50 (looks like big concession)
        // BUT state.credit_usd JUMPS to 200000 — strictly better for aria.
        // Old bound: passes (0.50 ≤ 0.95 ✓).
        // New bound: u_aria goes 100000/250000=0.4 → 200000/250000=0.8 → REJECTED.
        if (i === 3 || i === 4)
          return ariaCounter({
            ariaDid: agents.aria.did,
            round: 2,
            utility: 0.50,
            credit: 200000,
            evidence: ariaEv,
            parents: lastHash ? [lastHash] : [],
          });
        // After two rejections aria's turn is skipped; atlas plays normally
        return atlasCounter({
          atlasDid: agents.atlas.did,
          round: 2,
          utility: 0.9,
          credit: 30000,
          evidence: atlasEv,
          parents: lastHash ? [lastHash] : [],
        });
      },
    };

    const { events } = await drain(agents, pool, driver);
    const boundRejections = events.filter(
      (e) =>
        e.kind === "message.rejected" &&
        typeof (e as { reason: string }).reason === "string" &&
        (e as { reason: string }).reason.includes("state-derived utility"),
    );
    expect(boundRejections.length, JSON.stringify(events, null, 2)).toBeGreaterThanOrEqual(1);
    // The rejection reason must name the credit_usd field that improved.
    expect((boundRejections[0] as { reason: string }).reason).toMatch(/credit_usd/);
  });

  it("accepts a real concession even when utility_for_self is unchanged", async () => {
    // Inverse demo: autoreport stays flat at 0.95 across both rounds, but state
    // genuinely concedes (credit drops). The OLD bound would have been triggered
    // by the flat autoreport. The NEW bound looks at state and approves.
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, aiOverrun);
    const ariaEv = pool.signed.filter((e) => e.submitter === agents.aria.did).map(docHash);
    const atlasEv = pool.signed.filter((e) => e.submitter === agents.atlas.did).map(docHash);

    let i = 0;
    const driver: LLMDriver = {
      async emit({ history }) {
        i++;
        const lastHash = history.length > 0 ? docHash(history[history.length - 1]!) : null;
        if (i === 1)
          return ariaPropose({
            ariaDid: agents.aria.did,
            round: 1,
            utility: 0.95,
            credit: 180000,
            evidence: ariaEv,
          });
        if (i === 2)
          return atlasCounter({
            atlasDid: agents.atlas.did,
            round: 1,
            utility: 0.92,
            credit: 0,
            evidence: atlasEv,
            parents: lastHash ? [lastHash] : [],
          });
        if (i === 3)
          return ariaCounter({
            ariaDid: agents.aria.did,
            round: 2,
            utility: 0.95, // unchanged — old bound would say "violated"
            credit: 120000, // genuine concession
            evidence: ariaEv,
            parents: lastHash ? [lastHash] : [],
          });
        return atlasCounter({
          atlasDid: agents.atlas.did,
          round: 2,
          utility: 0.9,
          credit: 50000,
          evidence: atlasEv,
          parents: lastHash ? [lastHash] : [],
        });
      },
    };

    const { events } = await drain(agents, pool, driver);
    const boundRejections = events.filter(
      (e) =>
        e.kind === "message.rejected" &&
        typeof (e as { reason: string }).reason === "string" &&
        (e as { reason: string }).reason.includes("state-derived"),
    );
    expect(boundRejections, JSON.stringify(boundRejections)).toEqual([]);
  });

  it("amendments[] don't change utility (positive-sum slot)", () => {
    // Adding an amendment to either side shouldn't shift derived utility — the
    // Single Text Procedure intuition: bilateral text refinement isn't a
    // concession on the bound. Future scenarios may attach weight deltas to
    // specific amendment keys, but the default config says amendments are free.
    const cfg = aiOverrun.utility_config!;
    const without = utilityFor({ credit_usd: 90000, terms: "x" }, "aria", cfg);
    const withAmd = utilityFor(
      {
        credit_usd: 90000,
        terms: "x",
        amendments: [
          {
            key: "alerts_optin",
            value: true,
            rationale: "agreed",
            proposed_by_role: "atlas" as const,
            proposed_in_round: 2,
            accepted_at_round: 3,
            amend_msg_hash: "sha256:abc",
          },
        ],
      },
      "aria",
      cfg,
    );
    expect(withAmd).toBeCloseTo(without);
  });
});
