import type { AgentBook, AgentRole } from "./agents";
import type { EvidencePool } from "./fixtures";
import { signDoc, docHash, verifySignedDoc } from "./sign";
import { hash as hashOf } from "./canonical";
import {
  resolveMsgRef,
  resolveEvidenceRef,
  listValidMsgRefs,
  listValidEvidenceRefs,
} from "./refs";
import type {
  AcceptMsg,
  AmendMsg,
  CounterProposeMsg,
  DealState,
  Message,
  ProposeMsg,
  RevealMsg,
  SignedEvidence,
  SignedMessage,
} from "./types";
import type { Scenario } from "./scenarios/types";
import type { StateSchemaResult } from "./state_schema";
import {
  expectedConceder,
  utilityFor,
  utilityIncreases,
  zeuthenAdvisory,
  type ScenarioUtilityConfig,
} from "./utility";

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
    /** Strategic advisories pushed by the orchestrator (e.g. Zeuthen risk
     *  recommendation). NOT rejections — the agent SHOULD read them but is
     *  not required to follow. Surfaced in a separate prompt section so the
     *  LLM can distinguish "you broke a rule, fix it" from "the protocol's
     *  game-theoretic engine suggests you concede this turn". */
    advisories?: string[];
    /** Dispute id, when the driver runs inside a persisted dispute. Used by
     *  the Claude driver to attribute per-turn token spend to a specific
     *  dispute via recordClaudeTurn. Absent for the CLI demo path. */
    dispute_id?: string;
  }): Promise<MessageBody>;
}

export type OrchestratorConfig = {
  maxRounds: number; // default 5
  deadlockEpsilon: number; // utility delta below which we count as flat
  deadlockFlatRounds: number; // # of consecutive flat rounds before escalation
  /** Optional scenario reference. When provided, the orchestrator validates
   *  every Propose/CounterPropose state against `scenario.state_schema`. When
   *  absent, schema validation is skipped (legacy / schema-less disputes). */
  scenario?: Scenario;
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
  | { kind: "turn.skipped"; round: number; role: AgentRole; reason: string; attempts: number }
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

/** Look up the most recent Propose/CounterPropose state by a given DID.
 *  Used by the state-derived compromise bound and Zeuthen risk computation. */
function lastProposalState(history: SignedMessage[], did: string): DealState | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.from_agent !== did) continue;
    if (m.type === "Propose" || m.type === "CounterPropose") {
      return (m as ProposeMsg | CounterProposeMsg).payload.state;
    }
  }
  return null;
}

/** Format a state-derived compromise-bound rejection so the LLM can see
 *  exactly which fields nudged its utility upward. The orchestrator's check
 *  is on the SIGNED state, not on the agent's autoreported scalar — so the
 *  rejection must be specific enough to fix. */
function buildBoundRejection(args: {
  role: "aria" | "atlas";
  u_prev: number;
  u_curr: number;
  increases: ReturnType<typeof utilityIncreases>;
}): string {
  const lines = [
    `compromise bound violated (state-derived utility): your derived utility ` +
      `rose from ${args.u_prev.toFixed(3)} to ${args.u_curr.toFixed(3)} ` +
      `(Δ=+${(args.u_curr - args.u_prev).toFixed(3)}). Your new state must ` +
      `be at most as good for YOU as your previous offer.`,
  ];
  if (args.increases.length > 0) {
    lines.push(`Fields where your utility went UP this turn:`);
    for (const inc of args.increases.slice(0, 4)) {
      lines.push(
        `  - ${inc.field}: ${JSON.stringify(inc.prev)} → ${JSON.stringify(inc.curr)} ` +
          `(weighted Δ +${inc.delta.toFixed(3)})`,
      );
    }
    lines.push(
      `Move at least one of these fields back toward the counterparty's ` +
        `position, or change another field to compensate. The bound is on ` +
        `the WIRE-LEVEL state under the scenario's signed utility weights — ` +
        `the autoreported utility_for_self scalar is audit-only.`,
    );
  }
  return lines.join("\n");
}

/** Build the Zeuthen advisory for the agent whose turn is starting. Returns
 *  null when there's nothing to advise (no utility_config, or one or both
 *  sides haven't proposed yet — risk index is undefined in that case). */
function buildZeuthenAdvisory(args: {
  role: "aria" | "atlas";
  history: SignedMessage[];
  ariaDid: string;
  atlasDid: string;
  config: ScenarioUtilityConfig;
}): string | null {
  const aria_last = lastProposalState(args.history, args.ariaDid);
  const atlas_last = lastProposalState(args.history, args.atlasDid);
  const info = expectedConceder({
    state_aria_last: aria_last,
    state_atlas_last: atlas_last,
    config: args.config,
  });
  if (!info) return null;
  return zeuthenAdvisory(args.role, info);
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
      // find the proposal it points at (Accepts on Amend don't converge anything)
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

/** Validate a Propose/CounterPropose state object against the scenario's
 *  declared schema. Returns null on pass, or a human-readable error string. */
export function validateStateAgainstSchema(
  state: unknown,
  schema: StateSchemaResult,
): string | null {
  const result = schema.zodSchema.safeParse(state);
  if (result.success) return null;
  const issues = result.error.issues
    .slice(0, 4)
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  return (
    `state does not match scenario schema (domain="${schema.domain}").\n` +
    `Schema: ${JSON.stringify(schema.jsonSchema)}\n` +
    `Issues:\n${issues}\n` +
    `Note: introduce mid-flight clauses via the amendments[] slot, not unknown top-level keys.`
  );
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
  const stateSchema = config.scenario?.state_schema;
  const utilityConfig = config.scenario?.utility_config;

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
      // Zeuthen advisory: computed once at turn start (state hasn't changed
      // between attempts of the same turn — only one of them gets accepted).
      // Pushed via the dedicated `advisories` channel so the LLM can tell it
      // apart from rule-violation rejections.
      const advisories: string[] = [];
      if (utilityConfig) {
        const adv = buildZeuthenAdvisory({
          role,
          history,
          ariaDid: agents.aria.did,
          atlasDid: agents.atlas.did,
          config: utilityConfig,
        });
        if (adv) advisories.push(adv);
      }
      while (attempt < 2 && !accepted) {
        attempt++;
        const body = await driver.emit({
          role,
          round,
          history,
          evidence: evidence.signed,
          rejection_feedback: feedback.length > 0 ? [...feedback] : undefined,
          advisories: advisories.length > 0 ? [...advisories] : undefined,
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

        // Normalize evidence_refs (accept eN / evidence_id / sha256 — resolve to canonical sha256).
        const resolvedEv: string[] = [];
        const badEv: string[] = [];
        for (const r of body.evidence_refs) {
          const resolved = resolveEvidenceRef(r, evidence.signed);
          if (resolved) resolvedEv.push(resolved);
          else badEv.push(r);
        }
        if (badEv.length > 0) {
          const valid = listValidEvidenceRefs(evidence.signed);
          yield {
            kind: "message.rejected",
            round,
            role,
            reason: reject(
              `evidence_refs not in pool: ${badEv.join(", ")}. ` +
                `Cite as 'eN', evidence_id, or full sha256:... hash. ` +
                (valid.length > 0 ? `Valid: [${valid.join(" | ")}]` : `Pool is empty.`),
            ),
            attempt,
          };
          continue;
        }
        body.evidence_refs = resolvedEv;

        // Normalize parent_refs (accept mN / msg_id / sha256).
        const resolvedParents: string[] = [];
        const badParents: string[] = [];
        for (const r of body.parent_refs) {
          const resolved = resolveMsgRef(r, history);
          if (resolved) resolvedParents.push(resolved);
          else badParents.push(r);
        }
        if (badParents.length > 0) {
          const valid = listValidMsgRefs(history);
          yield {
            kind: "message.rejected",
            round,
            role,
            reason: reject(
              `parent_refs unknown: ${badParents.join(", ")}. ` +
                `Cite as 'mN', msg_id, or full sha256:... hash. ` +
                (valid.length > 0 ? `Valid: [${valid.join(" | ")}]` : `History is empty.`),
            ),
            attempt,
          };
          continue;
        }
        body.parent_refs = resolvedParents;

        // Resolve target_msg_hash for Critique / Accept.
        if (body.type === "Critique" || body.type === "Accept") {
          const tRaw = (body.payload as { target_msg_hash?: string }).target_msg_hash;
          if (typeof tRaw !== "string" || tRaw.length === 0) {
            yield {
              kind: "message.rejected",
              round,
              role,
              reason: reject(
                `${body.type} requires payload.target_msg_hash referencing a prior message.`,
              ),
              attempt,
            };
            continue;
          }
          const t = resolveMsgRef(tRaw, history);
          if (!t) {
            const valid = listValidMsgRefs(history);
            yield {
              kind: "message.rejected",
              round,
              role,
              reason: reject(
                `${body.type} target_msg_hash unknown: ${tRaw}. ` +
                  (valid.length > 0 ? `Valid: [${valid.join(" | ")}]` : `History is empty.`),
              ),
              attempt,
            };
            continue;
          }
          (body.payload as { target_msg_hash: string }).target_msg_hash = t;
        }

        // parent_refs requirement: prevent placeholder-as-binding-move.
        if (body.parent_refs.length === 0) {
          if (body.type === "Critique" || body.type === "Accept" || body.type === "CounterPropose") {
            yield {
              kind: "message.rejected",
              round,
              role,
              reason: reject(
                `${body.type} requires non-empty parent_refs. ` +
                  `Reference at least the message you are responding to.`,
              ),
              attempt,
            };
            continue;
          }
          if (body.type === "Propose" && round > 1) {
            yield {
              kind: "message.rejected",
              round,
              role,
              reason: reject(
                `Propose at round ${round} requires non-empty parent_refs (only the round-1 opening Propose may be empty).`,
              ),
              attempt,
            };
            continue;
          }
        }

        // Compromise bound for Propose/CounterPropose.
        //
        // Two paths:
        //   1) State-derived (preferred — when scenario.utility_config exists).
        //      Computes u(state) deterministically from signed weights. The
        //      autoreported utility_for_self stays in the payload as audit-only
        //      signal, but the BOUND is enforced on the wire-level state. This
        //      is the rigorous Zeuthen / Monotonic Concession Protocol bound
        //      from Rosenschein & Zlotkin (1994), see docs/PROTOCOL_FOUNDATIONS.md §A.
        //   2) Legacy autoreport (fallback — when utility_config is absent).
        //      Schema-less / older scenarios without a declared utility map
        //      keep the autoreport check so existing tests / consumers don't
        //      break. Documented in PROTOCOL_FOUNDATIONS.md as the historical
        //      "humo" bound.
        if (body.type === "Propose" || body.type === "CounterPropose") {
          if (utilityConfig) {
            const prevState = lastProposalState(history, agent.did);
            if (prevState) {
              const u_prev = utilityFor(prevState, role, utilityConfig);
              const u_curr = utilityFor(body.payload.state, role, utilityConfig);
              if (u_curr - u_prev > 1e-9) {
                const increases = utilityIncreases(
                  prevState,
                  body.payload.state,
                  role,
                  utilityConfig,
                );
                yield {
                  kind: "message.rejected",
                  round,
                  role,
                  reason: reject(
                    buildBoundRejection({ role, u_prev, u_curr, increases }),
                  ),
                  attempt,
                };
                continue;
              }
            }
          } else {
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
          // Schema validation for the proposed state.
          if (stateSchema) {
            const err = validateStateAgainstSchema(body.payload.state, stateSchema);
            if (err) {
              yield {
                kind: "message.rejected",
                round,
                role,
                reason: reject(err),
                attempt,
              };
              continue;
            }
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

        // Amend validation: key must be non-empty and must NOT collide with a
        // declared schema field (declared fields go through Propose/CounterPropose,
        // not Amend — Amend is for clauses the schema didn't anticipate).
        if (body.type === "Amend") {
          const key = (body as AmendMsg).payload?.key;
          if (typeof key !== "string" || key.length === 0) {
            yield {
              kind: "message.rejected",
              round,
              role,
              reason: reject(`Amend requires payload.key (non-empty string).`),
              attempt,
            };
            continue;
          }
          if (stateSchema) {
            const declared = Object.keys(
              (stateSchema.jsonSchema as { properties?: Record<string, unknown> }).properties ?? {},
            );
            if (declared.includes(key) && key !== "amendments") {
              yield {
                kind: "message.rejected",
                round,
                role,
                reason: reject(
                  `Amend.key '${key}' collides with a declared schema field. ` +
                    `Declared fields go through Propose/CounterPropose, not Amend. ` +
                    `Use Amend for genuinely novel clauses the schema didn't anticipate.`,
                ),
                attempt,
              };
              continue;
            }
          }
        }

        // Accept: target must be a known Propose/CounterPropose OR a known Amend.
        if (body.type === "Accept") {
          const target = body.payload.target_msg_hash;
          const targetMsg = history.find((m) => docHash(m) === target);
          const isDealAccept =
            targetMsg?.type === "Propose" || targetMsg?.type === "CounterPropose";
          const isAmendAccept = targetMsg?.type === "Amend";
          if (!isDealAccept && !isAmendAccept) {
            yield {
              kind: "message.rejected",
              round,
              role,
              reason: reject(
                `Accept must target the sha256 hash of a prior Propose, CounterPropose, or Amend; '${target}' is not one. Re-pick the hash from history.`,
              ),
              attempt,
            };
            continue;
          }

          // Self-Accept on Amend doesn't apply the amendment — only the
          // counterparty's Accept does. We allow self-Accept for symmetry but
          // it's a no-op semantically.

          // Cross-accept rule: only fires for deal-Accepts. Amend-Accepts are
          // independent of the deal flow and can land any time.
          if (isDealAccept) {
            const counterpartyDid =
              agents[role === "aria" ? "atlas" : "aria"].did;
            let lastCounterMove: SignedMessage | undefined;
            for (let i = history.length - 1; i >= 0; i--) {
              if (history[i]!.from_agent === counterpartyDid) {
                lastCounterMove = history[i];
                break;
              }
            }
            if (lastCounterMove && lastCounterMove.type === "Accept") {
              const cpTarget = (lastCounterMove as AcceptMsg).payload.target_msg_hash;
              const cpTargetMsg = history.find((m) => docHash(m) === cpTarget);
              const cpWasDealAccept =
                cpTargetMsg?.type === "Propose" ||
                cpTargetMsg?.type === "CounterPropose";
              if (cpWasDealAccept && cpTarget !== target) {
                const cpIdx = history.indexOf(lastCounterMove);
                yield {
                  kind: "message.rejected",
                  round,
                  role,
                  reason: reject(
                    `cross-accept rejected. Counterparty's most recent move (m${cpIdx + 1}) was Accept(${cpTarget.slice(0, 26)}…). ` +
                      `Your Accept must target the SAME hash to converge. ` +
                      `Either Accept ${cpTarget.slice(0, 26)}…, or submit a CounterPropose / Critique to keep negotiating.`,
                  ),
                  attempt,
                };
                continue;
              }
            }
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

      if (!accepted) {
        // Both attempts failed. Emit a structured skip event so audit consumers
        // (and the deadlock detector reasoning about this round's outcome) can
        // tell the difference between "no message because deadlocked" and
        // "no message because the LLM driver failed to comply".
        const lastReason =
          feedback[feedback.length - 1] ??
          "driver failed to produce a valid message after 2 attempts";
        yield {
          kind: "turn.skipped",
          round,
          role,
          reason: lastReason,
          attempts: 2,
        };
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
