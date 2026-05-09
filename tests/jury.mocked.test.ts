import { describe, expect, it, vi } from "vitest";
import { bootAgents } from "../src/agents.js";
import { buildEvidencePool } from "../src/fixtures.js";
import { docHash, verifySignedDoc } from "../src/sign.js";

// Mock Anthropic SDK to avoid live calls in this test.
vi.mock("../src/anthropic.js", () => {
  let callIdx = 0;
  return {
    MODELS: {
      negotiator: "mock-sonnet",
      juror_fast: "mock-haiku",
      juror_balanced: "mock-sonnet",
      juror_deep: "mock-opus",
    },
    getClient: () => ({
      messages: {
        create: async () => {
          // Three jurors take turns. We script vote outcomes.
          const idx = callIdx++ % 3;
          const outcomes = [
            { outcome: "claimant_partial", credit: 90000, conf: 0.85, rationale: "Aequitas: balanced." },
            { outcome: "claimant_partial", credit: 75000, conf: 0.8, rationale: "Utilis: efficient." },
            { outcome: "claimant_partial", credit: 100000, conf: 0.78, rationale: "Velox: clean enough." },
          ];
          const v = outcomes[idx]!;
          return {
            content: [
              {
                type: "tool_use",
                name: "cast_vote",
                input: {
                  outcome: v.outcome,
                  remedy_credit_usd: v.credit,
                  remedy_terms: v.outcome === "claimant_partial" ? "credit + commitments" : "no remedy",
                  rationale: v.rationale,
                  cited_evidence_hashes: [],
                  confidence: v.conf,
                },
              },
            ],
          };
        },
      },
    }),
  };
});

describe("jury (mocked)", () => {
  it("aggregates 3 votes into a signed ruling with majority outcome", async () => {
    const { deliberate } = await import("../src/jury.js");
    const agents = bootAgents();
    const { aiOverrun } = await import("../src/scenarios/ai-overrun.js");
    const pool = buildEvidencePool(agents, aiOverrun);
    const result = await deliberate({ agents, evidence: pool, history: [] });

    expect(result.votes).toHaveLength(3);
    for (const v of result.votes) expect(verifySignedDoc(v)).toBe(true);

    expect(verifySignedDoc(result.ruling)).toBe(true);
    expect(result.ruling.outcome).toBe("claimant_partial"); // unanimous
    // Compound confidence = 1.0 × mean(0.85, 0.8, 0.78) ≈ 0.81
    expect(result.ruling.confidence).toBeGreaterThan(0.7);
    // Median credit of [75000, 90000, 100000] is 90000
    expect(result.ruling.remedy.credit_usd).toBe(90000);
    // Cited votes match the vote hashes
    expect(result.ruling.cited_votes).toEqual(result.votes.map((v) => docHash(v)));
  });
});
