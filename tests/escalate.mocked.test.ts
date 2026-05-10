import { describe, expect, it, vi } from "vitest";

// Mock Anthropic before importing the engine — the jury invokes it.
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
          const idx = callIdx++ % 3;
          const outcomes = [
            { outcome: "claimant_partial", credit: 90000, conf: 0.85, rationale: "Aequitas." },
            { outcome: "claimant_partial", credit: 75000, conf: 0.8, rationale: "Utilis." },
            { outcome: "respondent_prevails", credit: 0, conf: 0.7, rationale: "Velox." },
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
                  remedy_terms: "credit + commitments",
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

describe("party-driven Escalate (mocked)", () => {
  it("submitting Escalate via the external path routes to the Tribunal and finalizes with a ruling bundle", async () => {
    const { openDispute, joinDispute } = await import("../src/dispute_store.js");
    const { submitExternalMessage } = await import("../src/dispute_engine.js");

    const opener = await openDispute({
      context_summary: "Test dispute",
      claim: "Test escalation routing — both sides external.",
      your_role: "aria",
      counterparty_external: true,
      max_rounds: 5,
    });
    const joiner = await joinDispute({ dispute_id: opener.dispute_id, role: "atlas" });

    // Round 1: aria opens with a Propose so atlas has something to escalate against.
    const proposeRes = await submitExternalMessage({
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

    expect(proposeRes.events.some((e) => e.kind === "message.accepted")).toBe(true);
    expect(proposeRes.state.finalized).toBe(false);
    expect(proposeRes.state.turn).toBe("atlas");

    // Atlas escalates instead of counter-proposing — should jump straight to the jury.
    const escRes = await submitExternalMessage({
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
          reason: "counterparty offer below reservation, will not move",
          requested_action: "mediator",
        },
      },
    });

    const kinds = escRes.events.map((e) => e.kind);
    expect(kinds).toContain("message.accepted"); // the Escalate is signed into history
    expect(kinds).toContain("escalation");
    expect(kinds).toContain("jury.ruled");
    expect(kinds).toContain("bundle.built");

    // Reason should be tagged with the escalating role + their stated reason.
    const escEvent = escRes.events.find((e) => e.kind === "escalation") as
      | { kind: "escalation"; reason: string }
      | undefined;
    expect(escEvent?.reason).toMatch(/^escalation_by_atlas:/);

    expect(escRes.state.finalized).toBe(true);
    const bundle = escRes.state.bundle;
    expect(bundle).not.toBeNull();
    expect(bundle!.outcome.kind).toBe("ruling");
    if (bundle!.outcome.kind === "ruling") {
      expect(bundle!.outcome.votes).toHaveLength(3);
      expect(bundle!.outcome.ruling.outcome).toBe("claimant_partial"); // 2/3 majority
    }

    // The Escalate must be present in the signed history of the bundle.
    const escInHistory = bundle!.messages.some((m) => m.type === "Escalate");
    expect(escInHistory).toBe(true);
  });

  it("dispute that is already finalized rejects further submit_message", async () => {
    const { openDispute, joinDispute } = await import("../src/dispute_store.js");
    const { submitExternalMessage } = await import("../src/dispute_engine.js");

    const opener = await openDispute({
      context_summary: "Test dispute",
      claim: "Test re-submit-after-finalized.",
      your_role: "aria",
      counterparty_external: true,
      max_rounds: 5,
    });
    const joiner = await joinDispute({ dispute_id: opener.dispute_id, role: "atlas" });

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
    await submitExternalMessage({
      dispute_id: opener.dispute_id,
      role_token: joiner.your_token,
      body: {
        type: "Escalate",
          summary: "test move",
        round: 1,
        from_agent: joiner.your_did,
        evidence_refs: [],
        parent_refs: ["m1"],
        payload: { reason: "deadlock", requested_action: "mediator" },
      },
    });

    await expect(
      submitExternalMessage({
        dispute_id: opener.dispute_id,
        role_token: opener.your_token,
        body: {
          type: "CounterPropose",
          summary: "test move",
          round: 2,
          from_agent: opener.your_did,
          evidence_refs: [],
          parent_refs: ["m2"],
          payload: {
            state: { credit_usd: 50000, terms: "half credit" },
            rationale: "Late move.",
            utility_for_self: 0.5,
          },
        },
      }),
    ).rejects.toThrow(/already finalized/i);
  });
});
