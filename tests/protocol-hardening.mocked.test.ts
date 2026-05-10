import { describe, expect, it, vi } from "vitest";

// Mock Anthropic so the jury can deliberate without a real API key.
// Always returns claimant_partial @ 75% so a binding ruling is deterministic.
vi.mock("../src/anthropic.js", () => {
  return {
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
                outcome: "claimant_partial",
                remedy_credit_usd: 50000,
                remedy_terms: "split-the-difference",
                rationale: "Mocked juror.",
                cited_evidence_hashes: [],
                confidence: 0.75,
              },
            },
          ],
        }),
      },
    }),
  };
});

describe("protocol hardening (mocked)", () => {
  describe("Fix 1: optimistic save with version CAS", () => {
    it("rejects a stale-version save with StaleVersionError", async () => {
      const { openDispute, getDispute, saveDispute } = await import(
        "../src/dispute_store.js"
      );
      const { StaleVersionError } = await import("../src/storage.js");

      const opener = await openDispute({
        context_summary: "Test dispute",
      claim: "CAS test.",
        your_role: "aria",
        counterparty_external: true,
        max_rounds: 5,
      });

      // Two readers load the same version simultaneously...
      const a = await getDispute(opener.dispute_id);
      const b = await getDispute(opener.dispute_id);
      expect(a.version).toBe(b.version);

      // First writer saves successfully (bumps version).
      await saveDispute(a);

      // Second writer should be rejected — its in-memory version is now stale.
      await expect(saveDispute(b)).rejects.toBeInstanceOf(StaleVersionError);
    });
  });

  describe("Fix 2: hold-out attribution baked into the bundle", () => {
    it("openDispute records opened_by_role; demo opens leave it null", async () => {
      const { openDispute, openDemoDispute, getDispute } = await import(
        "../src/dispute_store.js"
      );

      const real = await openDispute({
        context_summary: "Test dispute",
      claim: "real opener test",
        your_role: "atlas",
        counterparty_external: true,
        tribunal_mode: "none",
      });
      const realState = await getDispute(real.dispute_id);
      expect(realState.opened_by_role).toBe("atlas");
      expect(realState.tribunal_mode).toBe("none");

      const demo = await openDemoDispute({
        scenario_id: "ai-overrun",
        max_rounds: 5,
        tribunal_mode: "binding",
      });
      const demoState = await getDispute(demo.dispute_id);
      expect(demoState.opened_by_role).toBeNull();
    });
  });

  describe("Fix 3: Withdraw under binding+engaged routes to tribunal", () => {
    it("Withdraw before any Propose is a clean walk (binding, but nothing to bind)", async () => {
      const { openDispute } = await import("../src/dispute_store.js");
      const { withdrawFromDispute } = await import("../src/dispute_engine.js");

      const opener = await openDispute({
        context_summary: "Test dispute",
      claim: "early-walk test",
        your_role: "aria",
        counterparty_external: true,
        tribunal_mode: "binding",
      });

      const r = await withdrawFromDispute({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        reason: "Aria changed her mind",
      });

      expect(r.state.finalized).toBe(true);
      expect(r.state.bundle?.outcome.kind).toBe("withdrawn");
    });

    it("Withdraw AFTER both sides proposed under binding routes to tribunal (laudo still binds)", async () => {
      const { openDispute, joinDispute } = await import(
        "../src/dispute_store.js"
      );
      const { submitExternalMessage, withdrawFromDispute } = await import(
        "../src/dispute_engine.js"
      );

      const opener = await openDispute({
        context_summary: "Test dispute",
      claim: "binding-cant-be-escaped test",
        your_role: "aria",
        counterparty_external: true,
        tribunal_mode: "binding",
      });
      const joiner = await joinDispute({
        dispute_id: opener.dispute_id,
        role: "atlas",
      });

      // Aria proposes
      await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        body: {
          type: "Propose",
          summary: "test move",
          round: 1,
          from_agent: opener.your_did,
          evidence_refs: [],
          parent_refs: [],
          payload: {
            state: { credit_usd: 100000, terms: "full credit" },
            rationale: "Opening offer.",
            utility_for_self: 0.95,
          },
        },
      });
      // Atlas counters
      await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: joiner.your_token,
        body: {
          type: "CounterPropose",
          summary: "test move",
          round: 1,
          from_agent: joiner.your_did,
          evidence_refs: [],
          parent_refs: ["m1"],
          payload: {
            state: { credit_usd: 20000, terms: "minimal" },
            rationale: "Counter offer.",
            utility_for_self: 0.9,
          },
        },
      });

      // Now both sides have engaged. Atlas tries to walk to escape the laudo.
      const r = await withdrawFromDispute({
        dispute_id: opener.dispute_id,
        role_token: joiner.your_token,
        reason: "Atlas tries to escape an unfavorable ruling",
      });

      // The Withdraw IS in the audit trail...
      const messages = r.state.bundle?.messages ?? [];
      const hasWithdraw = messages.some((m) => m.type === "Withdraw");
      expect(hasWithdraw).toBe(true);

      // ...but the bundle is a RULING (binding pre-commit honored), not withdrawn.
      expect(r.state.finalized).toBe(true);
      expect(r.state.bundle?.outcome.kind).toBe("ruling");

      // Escalation event should be tagged with the withdraw-after-engagement reason.
      const escEvent = r.events.find((e) => e.kind === "escalation") as
        | { kind: "escalation"; reason: string }
        | undefined;
      expect(escEvent?.reason).toMatch(/^withdraw_after_engagement:atlas/);
    });

    it("Withdraw under tribunal_mode=none after engagement still walks (parties opted out)", async () => {
      const { openDispute, joinDispute } = await import(
        "../src/dispute_store.js"
      );
      const { submitExternalMessage, withdrawFromDispute } = await import(
        "../src/dispute_engine.js"
      );

      const opener = await openDispute({
        context_summary: "Test dispute",
      claim: "none-mode walk-anytime test",
        your_role: "aria",
        counterparty_external: true,
        tribunal_mode: "none",
      });
      const joiner = await joinDispute({
        dispute_id: opener.dispute_id,
        role: "atlas",
      });

      await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        body: {
          type: "Propose",
          summary: "test move",
          round: 1,
          from_agent: opener.your_did,
          evidence_refs: [],
          parent_refs: [],
          payload: {
            state: { credit_usd: 100000, terms: "full" },
            rationale: "Opening.",
            utility_for_self: 0.95,
          },
        },
      });
      await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: joiner.your_token,
        body: {
          type: "CounterPropose",
          summary: "test move",
          round: 1,
          from_agent: joiner.your_did,
          evidence_refs: [],
          parent_refs: ["m1"],
          payload: {
            state: { credit_usd: 0, terms: "no" },
            rationale: "Counter.",
            utility_for_self: 0.9,
          },
        },
      });

      const r = await withdrawFromDispute({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        reason: "Aria walks under mode=none",
      });

      expect(r.state.bundle?.outcome.kind).toBe("withdrawn");
    });

    it("Escalate is rejected under tribunal_mode=none with helpful feedback", async () => {
      const { openDispute, joinDispute } = await import(
        "../src/dispute_store.js"
      );
      const { submitExternalMessage } = await import("../src/dispute_engine.js");

      const opener = await openDispute({
        context_summary: "Test dispute",
      claim: "no-tribunal blocks Escalate",
        your_role: "aria",
        counterparty_external: true,
        tribunal_mode: "none",
      });
      const joiner = await joinDispute({
        dispute_id: opener.dispute_id,
        role: "atlas",
      });

      await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        body: {
          type: "Propose",
          summary: "test move",
          round: 1,
          from_agent: opener.your_did,
          evidence_refs: [],
          parent_refs: [],
          payload: {
            state: { credit_usd: 50000, terms: "x" },
            rationale: "Opening.",
            utility_for_self: 0.9,
          },
        },
      });
      const r = await submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: joiner.your_token,
        body: {
          type: "Escalate",
          summary: "test move",
          round: 1,
          from_agent: joiner.your_did,
          evidence_refs: [],
          parent_refs: ["m1"],
          payload: {
            reason: "I want jury",
            requested_action: "mediator",
          },
        },
      });

      const rejected = r.events.find((e) => e.kind === "message.rejected") as
        | { kind: "message.rejected"; reason: string }
        | undefined;
      expect(rejected).toBeDefined();
      expect(rejected!.reason).toMatch(/tribunal_mode=none/);
      expect(rejected!.reason).toMatch(/withdraw_dispute/);
      expect(r.state.finalized).toBe(false);
    });
  });
});
