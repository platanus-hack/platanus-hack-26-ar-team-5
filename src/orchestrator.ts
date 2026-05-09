import type { AgentBook, AgentRole } from "./agents.js";
import type { EvidencePool } from "./fixtures.js";
import { signDoc, docHash, verifySignedDoc } from "./sign.js";
import { hash as hashOf } from "./canonical.js";
import type {
  AcceptMsg,
  CounterProposeMsg,
  DealState,
  Message,
  ProposeMsg,
  RevealMsg,
  SignedEvidence,
  SignedMessage,
} from "./types.js";

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

/** Body of a message the LLM emits — orchestrator fills msg_id, timestamp, signs. */
export type MessageBody = DistributiveOmit<Message, "msg_id" | "timestamp">;

/** Pluggable LLM driver: can be a mock (tests) or real Claude (live). */
export interface LLMDriver {
  emit(input: {
    role: Exclude<AgentRole, "tribunal">;
    round: number;
    history: SignedMessage[];
    evidence: SignedEvidence[];
    /** When non-empty, the previous attempt was rejected with these reasons. */
    rejection_feedback?: string[];
  }): Promise<MessageBody>;
}

export type OrchestratorConfig = {
  maxRounds: number; // default 5
  deadlockEpsilon: number; // utility delta below which we count as flat
  deadlockFlatRounds: number; // # of consecutive flat rounds before escalation
};

export const DEFAULT_CONFIG: OrchestratorConfig = {
  maxRounds: 5,
  deadlockEpsilon: 0.05,
  deadlockFlatRounds: 2,
};

export type OrchestratorEvent =
  | { kind: "agent.boot"; role: AgentRole; did: string; name: string }
  | { kind: "evidence.loaded"; count: number; items: Array<{ id: string; tier: string; hash: string }> }
  | { kind: "round.start"; round: number }
  | { kind: "message.rejected"; round: number; role: AgentRole; reason: string; attempt: number }
  | { kind: "message.accepted"; round: number; role: AgentRole; signed: SignedMessage; hash: string }
  | { kind: "convergence"; final_state: DealState; accepted_msg_hash: string }
  | { kind: "deadline" }
  | { kind: "deadlock"; reason: string }
  | { kind: "escalation"; reason: string };

const ORDER: Array<Exclude<AgentRole, "tribunal">> = ["aria", "atlas"];

/** Look up the most recent Propose/CounterPropose by a given DID. */
function lastProposalUtility(history: SignedMessage[], did: string): number | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.from_agent !== did) continue;
    if (m.type === "Propose" || m.type === "CounterPropose") {
      return (m as ProposeMsg | CounterProposeMsg).payload.utility_for_self;
    }
  }
  return undefined;
}

function hasRevealForDomain(history: SignedMessage[], did: string, domain: string): boolean {
  return history.some(
    (m) => m.from_agent === did && m.type === "Reveal" && (m as RevealMsg).payload.domain === domain,
  );
}

function lastProposal(history: SignedMessage[]): SignedMessage | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.type === "Propose" || m.type === "CounterPropose") return m;
  }
  return undefined;
}

function isConverged(history: SignedMessage[]): { hash: string; state: DealState } | null {
  // Find pairs of Accept from both agents pointing at the same target_msg_hash.
  const acceptsByTarget = new Map<string, Set<string>>();
  for (const m of history) {
    if (m.type !== "Accept") continue;
    const target = (m as AcceptMsg).payload.target_msg_hash;
    if (!acceptsByTarget.has(target)) acceptsByTarget.set(target, new Set());
    acceptsByTarget.get(target)!.add(m.from_agent);
  }
  for (const [targetHash, fromSet] of acceptsByTarget) {
    if (fromSet.size >= 2) {
      // find the proposal it points at
      for (const m of history) {
        if (m.type !== "Propose" && m.type !== "CounterPropose") continue;
        if (docHash(m as SignedMessage) === targetHash) {
          return {
            hash: targetHash,
            state: (m as ProposeMsg | CounterProposeMsg).payload.state,
          };
        }
      }
    }
  }
  return null;
}

export type RunResult = {
  history: SignedMessage[];
  outcome:
    | { kind: "converged"; final_state: DealState; accepted_msg_hash: string }
    | { kind: "deadline" }
    | { kind: "deadlock"; reason: string }
    | { kind: "escalation"; reason: string };
};

export async function* runNegotiation(
  agents: AgentBook,
  evidence: EvidencePool,
  driver: LLMDriver,
  config: OrchestratorConfig = DEFAULT_CONFIG,
): AsyncGenerator<OrchestratorEvent, RunResult, void> {
  const history: SignedMessage[] = [];

  // Boot events
  for (const role of ["aria", "atlas", "tribunal"] as const) {
    yield {
      kind: "agent.boot",
      role,
      did: agents[role].did,
      name: agents[role].name,
    };
  }

  yield {
    kind: "evidence.loaded",
    count: evidence.signed.length,
    items: evidence.signed.map((e) => ({
      id: e.evidence_id,
      tier: e.tier,
      hash: docHash(e),
    })),
  };

  const utilityHistory: number[] = []; // sum of utilities per agent at each round

  for (let round = 1; round <= config.maxRounds; round++) {
    yield { kind: "round.start", round };

    for (const role of ORDER) {
      const agent = agents[role];
      let attempt = 0;
      let accepted = false;
      const feedback: string[] = [];
      while (attempt < 2 && !accepted) {
        attempt++;
        const body = await driver.emit({
          role,
          round,
          history,
          evidence: evidence.signed,
          rejection_feedback: feedback.length > 0 ? [...feedback] : undefined,
        });

        // Helper closures within this iteration — they capture round/role/attempt
        // and push the reason into `feedback` so the next attempt's prompt sees it.
        const reject = (reason: string) => {
          feedback.push(reason);
          return reason;
        };

        // Validate: from_agent must match
        if (body.from_agent !== agent.did) {
          yield {
            kind: "message.rejected",
            round,
            role,
            reason: reject(`from_agent mismatch (got ${body.from_agent}, expected ${agent.did})`),
            attempt,
          };
          continue;
        }

        // Validate: round must match
        if (body.round !== round) {
          yield {
            kind: "message.rejected",
            round,
            role,
            reason: reject(`round mismatch (got ${body.round}, expected ${round})`),
            attempt,
          };
          continue;
        }

        // Validate: evidence_refs must all exist in the pool
        const missingEvidence = body.evidence_refs.filter((h) => !evidence.byHash.has(h));
        if (missingEvidence.length > 0) {
          yield {
            kind: "message.rejected",
            round,
            role,
            reason: reject(`evidence_refs not in pool: ${missingEvidence.join(", ")}`),
            attempt,
          };
          continue;
        }

        // Validate: parent_refs must reference accepted prior messages
        const missingParents = body.parent_refs.filter(
          (h) => !history.some((m) => docHash(m) === h),
        );
        if (missingParents.length > 0) {
          yield {
            kind: "message.rejected",
            round,
            role,
            reason: reject(`parent_refs unknown: ${missingParents.join(", ")}`),
            attempt,
          };
          continue;
        }

        // Compromise bound for Propose/CounterPropose
        if (body.type === "Propose" || body.type === "CounterPropose") {
          const last = lastProposalUtility(history, agent.did);
          if (last !== undefined && body.payload.utility_for_self - last > 1e-9) {
            yield {
              kind: "message.rejected",
              round,
              role,
              reason: reject(
                `compromise bound violated: utility_for_self=${body.payload.utility_for_self} but your previous utility was ${last}; the new value MUST be ≤ that.`,
              ),
              attempt,
            };
            continue;
          }
        }

        // Reveal monotonicity (one reveal per domain per agent)
        if (body.type === "Reveal") {
          if (hasRevealForDomain(history, agent.did, body.payload.domain)) {
            yield {
              kind: "message.rejected",
              round,
              role,
              reason: reject(
                `reveal monotonicity violated: domain '${body.payload.domain}' already revealed by you. Pick a different domain or skip Reveal.`,
              ),
              attempt,
            };
            continue;
          }
        }

        // Accept: target must be a known Propose/CounterPropose
        if (body.type === "Accept") {
          const target = body.payload.target_msg_hash;
          const found = history.some(
            (m) =>
              (m.type === "Propose" || m.type === "CounterPropose") && docHash(m) === target,
          );
          if (!found) {
            yield {
              kind: "message.rejected",
              round,
              role,
              reason: reject(
                `Accept must target the sha256 hash of a prior Propose or CounterPropose message; '${target}' is not one. Re-pick the hash from history.`,
              ),
              attempt,
            };
            continue;
          }
        }

        // Sign and accept
        const msg: Message = {
          ...body,
          msg_id: cryptoRandomId(),
          timestamp: new Date().toISOString(),
        } as Message;
        const signed = signDoc(msg, agent.keypair, agent.did);
        // Sanity check we can verify our own signature
        if (!verifySignedDoc(signed)) {
          yield {
            kind: "message.rejected",
            round,
            role,
            reason: reject("internal: self-signed verification failed"),
            attempt,
          };
          continue;
        }
        const h = docHash(signed);
        history.push(signed);
        accepted = true;
        yield { kind: "message.accepted", round, role, signed, hash: h };
      }

      // After each agent's turn, check convergence — if both have already accepted, done.
      const conv = isConverged(history);
      if (conv) {
        yield {
          kind: "convergence",
          final_state: conv.state,
          accepted_msg_hash: conv.hash,
        };
        return {
          history,
          outcome: {
            kind: "converged",
            final_state: conv.state,
            accepted_msg_hash: conv.hash,
          },
        };
      }
    }

    // Deadlock check: track sum of last Propose/CounterPropose utilities each round
    const ariaU = lastProposalUtility(history, agents.aria.did) ?? 0;
    const atlasU = lastProposalUtility(history, agents.atlas.did) ?? 0;
    utilityHistory.push(ariaU + atlasU);
    if (utilityHistory.length >= config.deadlockFlatRounds + 1) {
      const tail = utilityHistory.slice(-(config.deadlockFlatRounds + 1));
      let flat = true;
      for (let i = 1; i < tail.length; i++) {
        if (Math.abs(tail[i]! - tail[i - 1]!) > config.deadlockEpsilon) {
          flat = false;
          break;
        }
      }
      if (flat) {
        const reason = `flat utilities for ${config.deadlockFlatRounds} rounds (Δ < ${config.deadlockEpsilon})`;
        yield { kind: "deadlock", reason };
        yield { kind: "escalation", reason: "deadlock" };
        return { history, outcome: { kind: "escalation", reason } };
      }
    }
  }

  // Hit max rounds without convergence → escalate
  yield { kind: "deadline" };
  yield { kind: "escalation", reason: "max_rounds_exhausted" };
  return {
    history,
    outcome: { kind: "escalation", reason: "max_rounds_exhausted" },
  };
}

// Public helper used by the orchestrator and re-exported for tests.
export { lastProposal };

function cryptoRandomId(): string {
  // 16 random bytes → hex. Crypto-strong via Web Crypto.
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
