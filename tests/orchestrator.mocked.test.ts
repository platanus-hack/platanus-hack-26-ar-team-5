import { describe, expect, it } from "vitest";
import { bootAgents } from "../src/agents";
import { buildEvidencePool } from "../src/fixtures";
import { aiOverrun } from "../src/scenarios/ai-overrun";
import { runNegotiation, type LLMDriver, type MessageBody } from "../src/orchestrator";
import { docHash, verifySignedDoc } from "../src/sign";
import type { SignedMessage } from "../src/types";

function ariaProposeBody(args: {
  ariaDid: string;
  round: number;
  utility: number;
  state: { credit_usd: number; terms: string };
  evidenceHashes: string[];
  parents?: string[];
}): MessageBody {
  return {
    type: "Propose",
    round: args.round,
    from_agent: args.ariaDid,
    evidence_refs: args.evidenceHashes,
    parent_refs: args.parents ?? [],
    payload: {
      state: args.state,
      rationale: "Customer's position",
      utility_for_self: args.utility,
    },
  } as MessageBody;
}

function atlasCounterBody(args: {
  atlasDid: string;
  round: number;
  utility: number;
  state: { credit_usd: number; terms: string };
  evidenceHashes: string[];
  parents?: string[];
}): MessageBody {
  return {
    type: "CounterPropose",
    round: args.round,
    from_agent: args.atlasDid,
    evidence_refs: args.evidenceHashes,
    parent_refs: args.parents ?? [],
    payload: {
      state: args.state,
      rationale: "Provider's position",
      utility_for_self: args.utility,
    },
  } as MessageBody;
}

function ariaCounterBody(args: {
  ariaDid: string;
  round: number;
  utility: number;
  state: { credit_usd: number; terms: string };
  evidenceHashes: string[];
  parents?: string[];
}): MessageBody {
  return { ...atlasCounterBody({ atlasDid: args.ariaDid, ...args }), from_agent: args.ariaDid };
}

function acceptBody(args: { fromDid: string; round: number; targetHash: string }): MessageBody {
  return {
    type: "Accept",
    round: args.round,
    from_agent: args.fromDid,
    evidence_refs: [],
    parent_refs: [args.targetHash],
    payload: { target_msg_hash: args.targetHash },
  };
}

class ScriptedDriver implements LLMDriver {
  index = 0;
  constructor(private readonly script: Array<(history: SignedMessage[]) => MessageBody>) {}
  async emit(input: { history: SignedMessage[] }): Promise<MessageBody> {
    if (this.index >= this.script.length) throw new Error("script exhausted");
    const fn = this.script[this.index++]!;
    return fn(input.history);
  }
}

async function drainNegotiation(
  agents: ReturnType<typeof bootAgents>,
  pool: ReturnType<typeof buildEvidencePool>,
  driver: LLMDriver,
) {
  const events: any[] = [];
  const gen = runNegotiation(agents, pool, driver, {
    maxRounds: 5,
    deadlockEpsilon: 0.05,
    deadlockFlatRounds: 2,
  });
  let result: Awaited<ReturnType<typeof gen.next>>;
  do {
    result = await gen.next();
    if (!result.done) events.push(result.value);
  } while (!result.done);
  return { events, result: result.value };
}

describe("orchestrator (mocked) — happy path", () => {
  it("converges in 4 rounds with the AI-overrun script and signs every message", async () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, aiOverrun);
    const ariaEvidence = pool.signed.filter((e) => e.submitter === agents.aria.did).map(docHash);
    const atlasEvidence = pool.signed
      .filter((e) => e.submitter === agents.atlas.did)
      .map(docHash);

    let ariaPropR1Hash = "";
    let atlasCntR3Hash = "";

    const script: Array<(h: SignedMessage[]) => MessageBody> = [
      // Round 1
      () =>
        ariaProposeBody({
          ariaDid: agents.aria.did,
          round: 1,
          utility: 0.95,
          state: { credit_usd: 180000, terms: "full overage refund" },
          evidenceHashes: ariaEvidence,
        }),
      (h) => {
        ariaPropR1Hash = docHash(h[h.length - 1]!);
        return atlasCounterBody({
          atlasDid: agents.atlas.did,
          round: 1,
          utility: 0.92,
          state: { credit_usd: 0, terms: "case closed per ToS §8.2" },
          evidenceHashes: atlasEvidence,
          parents: [ariaPropR1Hash],
        });
      },
      // Round 2
      () =>
        ariaCounterBody({
          ariaDid: agents.aria.did,
          round: 2,
          utility: 0.88,
          state: { credit_usd: 150000, terms: "refund minus support fee" },
          evidenceHashes: ariaEvidence,
        }),
      () =>
        atlasCounterBody({
          atlasDid: agents.atlas.did,
          round: 2,
          utility: 0.86,
          state: { credit_usd: 45000, terms: "goodwill, no admission" },
          evidenceHashes: atlasEvidence,
        }),
      // Round 3
      () =>
        ariaCounterBody({
          ariaDid: agents.aria.did,
          round: 3,
          utility: 0.78,
          state: { credit_usd: 110000, terms: "credit + alerts auto-enrollment" },
          evidenceHashes: ariaEvidence,
        }),
      (h) => {
        const cnt = atlasCounterBody({
          atlasDid: agents.atlas.did,
          round: 3,
          utility: 0.81,
          state: {
            credit_usd: 90000,
            terms: "credit + alerts opt-in + eval API commit",
          },
          evidenceHashes: atlasEvidence,
        });
        // capture future hash by simulating: not possible until signed, so we'll
        // pick it up after this turn via history search in subsequent script step
        return cnt;
      },
      // Round 4: both Accept the Atlas R3 proposal
      (h) => {
        const last = h[h.length - 1]!;
        atlasCntR3Hash = docHash(last);
        return acceptBody({
          fromDid: agents.aria.did,
          round: 4,
          targetHash: atlasCntR3Hash,
        });
      },
      () =>
        acceptBody({
          fromDid: agents.atlas.did,
          round: 4,
          targetHash: atlasCntR3Hash,
        }),
    ];

    const { events, result } = await drainNegotiation(agents, pool, new ScriptedDriver(script));

    // No rejected messages
    const rejected = events.filter((e) => e.kind === "message.rejected");
    expect(rejected, JSON.stringify(rejected)).toEqual([]);

    // Converged
    expect(result.outcome.kind).toBe("converged");
    if (result.outcome.kind === "converged") {
      expect(result.outcome.final_state).toEqual({
        credit_usd: 90000,
        terms: "credit + alerts opt-in + eval API commit",
      });
    }

    // History has 8 signed messages and every one verifies
    expect(result.history).toHaveLength(8);
    for (const m of result.history) {
      expect(verifySignedDoc(m)).toBe(true);
    }
  });
});

describe("orchestrator (mocked) — validation rejections", () => {
  it("rejects evidence_refs that don't exist in the pool", async () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, aiOverrun);
    const driver: LLMDriver = {
      async emit({ round }) {
        // Always emit bogus evidence_refs; orchestrator should reject twice and move on.
        return ariaProposeBody({
          ariaDid: agents.aria.did,
          round,
          utility: 0.9,
          state: { credit_usd: 100, terms: "x" },
          evidenceHashes: ["sha256:deadbeef".padEnd(71, "0")],
        });
      },
    };
    const { events } = await drainNegotiation(agents, pool, driver);
    const rejections = events.filter((e) => e.kind === "message.rejected");
    expect(rejections.length).toBeGreaterThan(0);
    expect((rejections[0] as { reason: string }).reason).toMatch(/evidence_refs/);
  });

  it("rejects compromise-bound violations (utility increases vs prior)", async () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, aiOverrun);
    const ariaEvidence = pool.signed.filter((e) => e.submitter === agents.aria.did).map(docHash);
    const atlasEvidence = pool.signed.filter((e) => e.submitter === agents.atlas.did).map(docHash);

    // R1: Aria proposes utility 0.7. R1: Atlas counters. R2: Aria proposes utility 0.9 — must be rejected.
    let counter = 0;
    const driver: LLMDriver = {
      async emit({ role, round }) {
        counter++;
        if (counter === 1)
          return ariaProposeBody({
            ariaDid: agents.aria.did,
            round,
            utility: 0.7,
            state: { credit_usd: 50000, terms: "x" },
            evidenceHashes: ariaEvidence,
          });
        if (counter === 2)
          return atlasCounterBody({
            atlasDid: agents.atlas.did,
            round,
            utility: 0.7,
            state: { credit_usd: 0, terms: "x" },
            evidenceHashes: atlasEvidence,
          });
        if (counter === 3)
          // r2 Aria proposes higher utility — should be rejected on attempt 1 + attempt 2
          return ariaCounterBody({
            ariaDid: agents.aria.did,
            round,
            utility: 0.9, // BAD: > prior 0.7
            state: { credit_usd: 60000, terms: "x" },
            evidenceHashes: ariaEvidence,
          });
        // After rejected aria, orchestrator continues with atlas turn (but aria's slot is empty);
        // emit something innocuous for whatever turn comes. Driver should not be reached as much.
        return atlasCounterBody({
          atlasDid: agents.atlas.did,
          round,
          utility: 0.65,
          state: { credit_usd: 30000, terms: "x" },
          evidenceHashes: atlasEvidence,
        });
      },
    };
    const { events } = await drainNegotiation(agents, pool, driver);
    const compromiseRejections = events.filter(
      (e) =>
        e.kind === "message.rejected" &&
        typeof (e as { reason: string }).reason === "string" &&
        (e as { reason: string }).reason.includes("compromise"),
    );
    expect(compromiseRejections.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects reveal monotonicity violations (same domain twice)", async () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, aiOverrun);
    const ariaEvidence = pool.signed.filter((e) => e.submitter === agents.aria.did).map(docHash);
    const atlasEvidence = pool.signed.filter((e) => e.submitter === agents.atlas.did).map(docHash);

    let count = 0;
    const driver: LLMDriver = {
      async emit({ round }) {
        count++;
        if (count === 1) {
          return {
            type: "Reveal",
            round,
            from_agent: agents.aria.did,
            evidence_refs: [],
            parent_refs: [],
            payload: { domain: "retry-policy", information: "automatic SDK retries" },
          } as MessageBody;
        }
        if (count === 2)
          return atlasCounterBody({
            atlasDid: agents.atlas.did,
            round,
            utility: 0.9,
            state: { credit_usd: 0, terms: "x" },
            evidenceHashes: atlasEvidence,
          });
        if (count === 3) {
          // Aria reveals same domain again — must be rejected
          return {
            type: "Reveal",
            round,
            from_agent: agents.aria.did,
            evidence_refs: [],
            parent_refs: [],
            payload: { domain: "retry-policy", information: "manual retries actually" },
          } as MessageBody;
        }
        // After rejection, fall through to a safe Propose
        return ariaProposeBody({
          ariaDid: agents.aria.did,
          round,
          utility: 0.5,
          state: { credit_usd: 100, terms: "x" },
          evidenceHashes: ariaEvidence,
        });
      },
    };
    const { events } = await drainNegotiation(agents, pool, driver);
    const monoRejections = events.filter(
      (e) =>
        e.kind === "message.rejected" &&
        typeof (e as { reason: string }).reason === "string" &&
        (e as { reason: string }).reason.includes("monotonicity"),
    );
    expect(monoRejections.length).toBeGreaterThanOrEqual(1);
  });

  it("escalates when max rounds reached without convergence", async () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, aiOverrun);
    const ariaEvidence = pool.signed.filter((e) => e.submitter === agents.aria.did).map(docHash);
    const atlasEvidence = pool.signed.filter((e) => e.submitter === agents.atlas.did).map(docHash);

    // Both agents propose with steadily decreasing utility but never accept
    let count = 0;
    const driver: LLMDriver = {
      async emit({ round, role }) {
        count++;
        const u = Math.max(0.3, 0.95 - 0.1 * round);
        if (role === "aria")
          return ariaProposeBody({
            ariaDid: agents.aria.did,
            round,
            utility: u,
            state: { credit_usd: 200000 - round * 10000, terms: `r${round}-aria` },
            evidenceHashes: ariaEvidence,
          });
        return atlasCounterBody({
          atlasDid: agents.atlas.did,
          round,
          utility: u,
          state: { credit_usd: round * 10000, terms: `r${round}-atlas` },
          evidenceHashes: atlasEvidence,
        });
      },
    };
    const { events, result } = await drainNegotiation(agents, pool, driver);
    expect(result.outcome.kind).toBe("escalation");
    expect(events.some((e) => e.kind === "deadline" || e.kind === "escalation")).toBe(true);
  });
});
