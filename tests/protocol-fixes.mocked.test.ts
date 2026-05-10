import { describe, expect, it, vi } from "vitest";

/**
 * Regression tests for the protocol fixes that don't require new design
 * decisions:
 *  - Atomic CAS in MemoryStorage (saveDispute is truly compare-and-swap).
 *  - Jury Promise.allSettled (one juror failure no longer kills deliberation).
 *  - Jury INCONCLUSIVE on majority abstain.
 *  - Jury INCONCLUSIVE when any juror is unavailable.
 *  - Jury prompt is parameterized — no hardcoded SaaS-billing framing.
 */

describe("CAS atomicity (mocked)", () => {
  it("MemoryStorage.casPut rejects mismatched expectedVersion", async () => {
    const { getStorage } = await import("../src/storage.js");
    const storage = getStorage();
    const id = `cas_test_${Math.random().toString(36).slice(2)}`;
    const stored = {
      dispute_id: id,
      claim: "test",
      scenario_id: null,
      signed_evidence: [],
      history: [],
      controllers: { aria: "external" as const, atlas: "external" as const },
      role_tokens: { aria: "tok_a", atlas: "tok_b" },
      claimed: { aria: true, atlas: false },
      turn: "aria" as const,
      current_round: 1,
      max_rounds: 5,
      tribunal_mode: "binding" as const,
      opened_by_role: "aria" as const,
      pending_feedback: [],
      finalized: null,
      ruling: null,
      created_at: new Date().toISOString(),
      agent_keys: { aria: "00".repeat(32), atlas: "00".repeat(32), tribunal: "00".repeat(32) },
      version: 1,
    };
    // Initial put at version 1 (expectedVersion=0, no record yet).
    const r0 = await storage.casPut(stored, 0);
    expect(r0.ok).toBe(true);

    // Stale write at expectedVersion=0 (already at 1) must fail.
    const r1 = await storage.casPut({ ...stored, version: 2 }, 0);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.currentVersion).toBe(1);

    // Correct expectedVersion=1 succeeds.
    const r2 = await storage.casPut({ ...stored, version: 2 }, 1);
    expect(r2.ok).toBe(true);

    await storage.delete(id);
  });

  it("two concurrent saveDispute calls cannot both succeed at the same target version", async () => {
    const { openDispute, getDispute } = await import(
      "../src/dispute_store.js"
    );
    const { saveDispute, StaleVersionError } = await import("../src/storage.js");

    const opened = await openDispute({
      claim: "concurrent-saves",
      your_role: "aria",
      counterparty_external: true,
    });
    // Two independent loads from the same starting version.
    const a = await getDispute(opened.dispute_id);
    const b = await getDispute(opened.dispute_id);
    expect(a.version).toBe(b.version);

    // Race them. Order is deterministic in MemoryStorage but the assertion
    // is "exactly one succeeds, the other gets StaleVersionError" — true
    // regardless of which wins.
    const settled = await Promise.allSettled([saveDispute(a), saveDispute(b)]);
    const fulfilled = settled.filter((s) => s.status === "fulfilled");
    const rejected = settled.filter((s) => s.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(StaleVersionError);
  });
});

describe("jury fault tolerance (mocked)", () => {
  it("a single juror failure no longer kills deliberation; outcome is INCONCLUSIVE abstain", async () => {
    let callIdx = 0;
    vi.resetModules();
    vi.doMock("../src/anthropic.js", () => ({
      MODELS: {
        negotiator: "mock-sonnet",
        juror_fast: "mock-haiku",
        juror_balanced: "mock-sonnet",
        juror_deep: "mock-opus",
      },
      getClient: () => ({
        messages: {
          create: async () => {
            const idx = callIdx++ % 3;
            if (idx === 1) {
              throw new Error("simulated upstream 5xx");
            }
            return {
              content: [
                {
                  type: "tool_use",
                  name: "cast_vote",
                  input: {
                    outcome: "claimant_partial",
                    remedy_credit_usd: 50000,
                    remedy_terms: "split",
                    rationale: "ok",
                    cited_evidence_hashes: [],
                    confidence: 0.85,
                  },
                },
              ],
            };
          },
        },
      }),
    }));

    const { deliberate } = await import("../src/jury.js");
    const { bootAgents } = await import("../src/agents.js");
    const { buildEvidencePool } = await import("../src/fixtures.js");
    const { aiOverrun } = await import("../src/scenarios/ai-overrun.js");
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, aiOverrun);
    const result = await deliberate({ agents, evidence: pool, history: [] });

    // Panel size still 3 — failure was substituted with an abstain stub.
    expect(result.votes).toHaveLength(3);
    const abstains = result.votes.filter((v) => v.outcome === "abstain");
    expect(abstains.length).toBeGreaterThanOrEqual(1);
    // Inconclusive marker present in rationale.
    expect(result.ruling.rationale.startsWith("INCONCLUSIVE")).toBe(true);
    // Final outcome forced to abstain because a juror was unavailable.
    expect(result.ruling.outcome).toBe("abstain");
    vi.doUnmock("../src/anthropic.js");
  });

  it("majority abstain at high reported confidence is still flagged INCONCLUSIVE", async () => {
    vi.resetModules();
    vi.doMock("../src/anthropic.js", () => ({
      MODELS: {
        negotiator: "mock-sonnet",
        juror_fast: "mock-haiku",
        juror_balanced: "mock-sonnet",
        juror_deep: "mock-opus",
      },
      getClient: () => ({
        messages: {
          create: async () => ({
            content: [
              {
                type: "tool_use",
                name: "cast_vote",
                input: {
                  outcome: "abstain",
                  remedy_credit_usd: 0,
                  remedy_terms: "no decision",
                  rationale: "evidence too thin",
                  cited_evidence_hashes: [],
                  confidence: 0.95,
                },
              },
            ],
          }),
        },
      }),
    }));

    const { deliberate } = await import("../src/jury.js");
    const { bootAgents } = await import("../src/agents.js");
    const { buildEvidencePool } = await import("../src/fixtures.js");
    const { aiOverrun } = await import("../src/scenarios/ai-overrun.js");
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, aiOverrun);
    const result = await deliberate({ agents, evidence: pool, history: [] });

    expect(result.ruling.outcome).toBe("abstain");
    expect(result.ruling.rationale.startsWith("INCONCLUSIVE")).toBe(true);
    expect(result.ruling.rationale).toMatch(/Majority outcome was abstain/);
    vi.doUnmock("../src/anthropic.js");
  });
});

describe("jury prompt parameterization (mocked)", () => {
  it("uses scenario display_names and case_summary instead of hardcoded SaaS framing", async () => {
    let lastUserPrompt = "";
    vi.resetModules();
    vi.doMock("../src/anthropic.js", () => ({
      MODELS: {
        negotiator: "mock-sonnet",
        juror_fast: "mock-haiku",
        juror_balanced: "mock-sonnet",
        juror_deep: "mock-opus",
      },
      getClient: () => ({
        messages: {
          create: async (req: { messages: Array<{ content: string }> }) => {
            lastUserPrompt = req.messages[0]!.content;
            return {
              content: [
                {
                  type: "tool_use",
                  name: "cast_vote",
                  input: {
                    outcome: "claimant_partial",
                    remedy_credit_usd: 0,
                    remedy_terms: "split",
                    rationale: "ok",
                    cited_evidence_hashes: [],
                    confidence: 0.8,
                  },
                },
              ],
            };
          },
        },
      }),
    }));

    const { deliberate } = await import("../src/jury.js");
    const { bootAgents } = await import("../src/agents.js");
    const { buildEvidencePool } = await import("../src/fixtures.js");
    const { oncology } = await import("../src/scenarios/oncology.js");
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, oncology);
    await deliberate({
      agents,
      evidence: pool,
      history: [],
      scenario: oncology,
    });

    // The prompt must NOT contain the old hardcoded SaaS framing.
    expect(lastUserPrompt).not.toMatch(/FinOps agent/);
    expect(lastUserPrompt).not.toMatch(/Provider's Account agent/);
    // It MUST contain the oncology scenario's actual display names.
    expect(lastUserPrompt).toContain(oncology.agents.aria.display_name);
    expect(lastUserPrompt).toContain(oncology.agents.atlas.display_name);
    // And the oncology case_summary.
    expect(lastUserPrompt).toContain(oncology.case_summary);
    vi.doUnmock("../src/anthropic.js");
  });
});
