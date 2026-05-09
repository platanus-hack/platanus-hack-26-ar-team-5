/**
 * Step-engine for BYO-agent disputes. Persists state via dispute_store
 * (memory-by-default, Redis-when-configured) so multi-request flows on
 * Vercel cold-start instances actually work.
 */
import { signDoc, docHash, verifySignedDoc } from "./sign.js";
import { hash as hashOf } from "./canonical.js";
import { makeClaudeDriver } from "./claude_driver.js";
import { deliberate } from "./jury.js";
import {
  type DisputeState,
  type AgentRole,
  getDispute,
  saveDispute,
} from "./dispute_store.js";
import type { MessageBody } from "./orchestrator.js";
import type {
  AcceptMsg,
  Bundle,
  CounterProposeMsg,
  DealState,
  Message,
  ProposeMsg,
  RevealMsg,
  SignedMessage,
} from "./types.js";

export type StepEvent =
  | { kind: "message.rejected"; role: AgentRole; reason: string; attempt: number }
  | { kind: "message.accepted"; role: AgentRole; signed: SignedMessage; hash: string }
  | { kind: "round.advanced"; new_round: number }
  | { kind: "convergence"; final_state: DealState; accepted_msg_hash: string }
  | { kind: "deadlock"; reason: string }
  | { kind: "escalation"; reason: string }
  | { kind: "jury.ruled" }
  | { kind: "bundle.built"; bundle: Bundle };

const ORDER: AgentRole[] = ["aria", "atlas"];

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

function isConverged(history: SignedMessage[]): { hash: string; state: DealState } | null {
  const acceptsByTarget = new Map<string, Set<string>>();
  for (const m of history) {
    if (m.type !== "Accept") continue;
    const target = (m as AcceptMsg).payload.target_msg_hash;
    if (!acceptsByTarget.has(target)) acceptsByTarget.set(target, new Set());
    acceptsByTarget.get(target)!.add(m.from_agent);
  }
  for (const [targetHash, fromSet] of acceptsByTarget) {
    if (fromSet.size >= 2) {
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

function validateBody(state: DisputeState, role: AgentRole, body: MessageBody): string | null {
  const agent = state.agents[role];
  if (body.from_agent !== agent.did)
    return `from_agent mismatch (got ${body.from_agent}, expected ${agent.did})`;
  if (body.round !== state.current_round)
    return `round mismatch (got ${body.round}, expected ${state.current_round})`;
  const missingEvidence = body.evidence_refs.filter((h) => !state.evidence.byHash.has(h));
  if (missingEvidence.length > 0)
    return `evidence_refs not in pool: ${missingEvidence.join(", ")}`;
  const missingParents = body.parent_refs.filter(
    (h) => !state.history.some((m) => docHash(m) === h),
  );
  if (missingParents.length > 0) return `parent_refs unknown: ${missingParents.join(", ")}`;
  if (body.type === "Propose" || body.type === "CounterPropose") {
    const last = lastProposalUtility(state.history, agent.did);
    if (last !== undefined && body.payload.utility_for_self - last > 1e-9)
      return `compromise bound violated: utility_for_self=${body.payload.utility_for_self} but your previous utility was ${last}; the new value MUST be ≤ that.`;
  }
  if (body.type === "Reveal") {
    if (hasRevealForDomain(state.history, agent.did, body.payload.domain))
      return `reveal monotonicity violated: domain '${body.payload.domain}' already revealed.`;
  }
  if (body.type === "Accept") {
    const target = body.payload.target_msg_hash;
    const found = state.history.some(
      (m) => (m.type === "Propose" || m.type === "CounterPropose") && docHash(m) === target,
    );
    if (!found)
      return `Accept must target the sha256 hash of a prior Propose or CounterPropose message; '${target}' is not one.`;
  }
  return null;
}

function cryptoRandomId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function pushMessage(state: DisputeState, role: AgentRole, body: MessageBody): SignedMessage {
  const agent = state.agents[role];
  const msg: Message = {
    ...body,
    msg_id: cryptoRandomId(),
    timestamp: new Date().toISOString(),
  } as Message;
  const signed = signDoc(msg, agent.keypair, agent.did);
  if (!verifySignedDoc(signed))
    throw new Error("internal: self-signed verification failed");
  state.history.push(signed);
  state.pending_feedback = [];
  return signed;
}

function advanceTurn(state: DisputeState): { advanced_round: boolean } {
  const idx = ORDER.indexOf(state.turn);
  if (idx < ORDER.length - 1) {
    state.turn = ORDER[idx + 1]!;
    return { advanced_round: false };
  }
  state.turn = ORDER[0]!;
  state.current_round += 1;
  return { advanced_round: true };
}

function buildBundle(state: DisputeState, outcome: Bundle["outcome"]): Bundle {
  const bundleNoHash: Omit<Bundle, "root_hash"> = {
    type: "Bundle",
    scenario: state.scenario_id,
    agents: {
      aria: state.agents.aria.did,
      atlas: state.agents.atlas.did,
      tribunal: state.agents.tribunal.did,
    },
    evidence: state.evidence.signed,
    messages: state.history,
    outcome,
    created_at: new Date().toISOString(),
  };
  const bundle: Bundle = { ...bundleNoHash, root_hash: hashOf(bundleNoHash) };
  state.finalized = { bundle };
  return bundle;
}

async function escalateAndFinalize(
  state: DisputeState,
  reason: string,
): Promise<StepEvent[]> {
  const events: StepEvent[] = [{ kind: "escalation", reason }];
  const { votes, ruling } = await deliberate({
    agents: state.agents,
    evidence: state.evidence,
    history: state.history,
  });
  state.ruling = { votes, ruling };
  events.push({ kind: "jury.ruled" });
  const bundle = buildBundle(state, { kind: "ruling", votes, ruling });
  events.push({ kind: "bundle.built", bundle });
  return events;
}

function applyAttempt(
  state: DisputeState,
  role: AgentRole,
  body: MessageBody,
  attempt: number,
): { events: StepEvent[]; accepted: boolean } {
  const events: StepEvent[] = [];
  const reason = validateBody(state, role, body);
  if (reason) {
    state.pending_feedback.push(reason);
    events.push({ kind: "message.rejected", role, reason, attempt });
    return { events, accepted: false };
  }
  const signed = pushMessage(state, role, body);
  events.push({ kind: "message.accepted", role, signed, hash: docHash(signed) });
  return { events, accepted: true };
}

/** Drive any consecutive Claude-controlled turns until the next external turn or terminal state. */
export async function advanceClaudeTurns(state: DisputeState): Promise<StepEvent[]> {
  const events: StepEvent[] = [];
  while (
    !state.finalized &&
    state.controllers[state.turn] === "claude" &&
    state.current_round <= state.max_rounds
  ) {
    const role = state.turn;
    const driver = makeClaudeDriver({
      scenario: state.scenario,
      didByRole: { aria: state.agents.aria.did, atlas: state.agents.atlas.did },
    });
    let attempt = 0;
    let accepted = false;
    while (attempt < 2 && !accepted) {
      attempt++;
      const body = await driver.emit({
        role,
        round: state.current_round,
        history: state.history,
        evidence: state.evidence.signed,
        rejection_feedback:
          state.pending_feedback.length > 0 ? [...state.pending_feedback] : undefined,
      });
      const r = applyAttempt(state, role, body, attempt);
      events.push(...r.events);
      accepted = r.accepted;
    }
    const conv = isConverged(state.history);
    if (conv) {
      events.push({
        kind: "convergence",
        final_state: conv.state,
        accepted_msg_hash: conv.hash,
      });
      const bundle = buildBundle(state, {
        kind: "converged",
        final_state: conv.state,
        accepted_msg_hash: conv.hash,
      });
      events.push({ kind: "bundle.built", bundle });
      return events;
    }
    const adv = advanceTurn(state);
    if (adv.advanced_round)
      events.push({ kind: "round.advanced", new_round: state.current_round });
    if (state.current_round > state.max_rounds) {
      const escalation = await escalateAndFinalize(state, "max_rounds_exhausted");
      events.push(...escalation);
      return events;
    }
  }
  return events;
}

export type SubmitResult = {
  events: StepEvent[];
  state: ReturnType<typeof publicState>;
};

export async function submitExternalMessage(args: {
  dispute_id: string;
  role_token: string;
  body: MessageBody;
}): Promise<SubmitResult> {
  const state = await getDispute(args.dispute_id);
  if (state.finalized) throw new Error("dispute is already finalized");
  const role = state.turn;
  if (state.controllers[role] !== "external")
    throw new Error(
      `it is currently the ${role} turn, which is not externally controlled in this dispute`,
    );
  if (state.role_tokens[role] !== args.role_token)
    throw new Error("role_token mismatch — you are not authorized to act on this turn");

  const events: StepEvent[] = [];
  const r = applyAttempt(state, role, args.body, 1);
  events.push(...r.events);
  if (!r.accepted) {
    await saveDispute(state);
    return { events, state: publicState(state) };
  }
  const conv = isConverged(state.history);
  if (conv) {
    events.push({
      kind: "convergence",
      final_state: conv.state,
      accepted_msg_hash: conv.hash,
    });
    const bundle = buildBundle(state, {
      kind: "converged",
      final_state: conv.state,
      accepted_msg_hash: conv.hash,
    });
    events.push({ kind: "bundle.built", bundle });
    await saveDispute(state);
    return { events, state: publicState(state) };
  }
  const adv = advanceTurn(state);
  if (adv.advanced_round)
    events.push({ kind: "round.advanced", new_round: state.current_round });
  if (state.current_round > state.max_rounds) {
    const escalation = await escalateAndFinalize(state, "max_rounds_exhausted");
    events.push(...escalation);
    await saveDispute(state);
    return { events, state: publicState(state) };
  }
  // Drive any Claude-controlled turns. We persist between each Claude turn
  // so that an interrupted advance leaves a recoverable state in storage.
  while (
    !state.finalized &&
    state.controllers[state.turn] === "claude" &&
    state.current_round <= state.max_rounds
  ) {
    const claudeEvents = await advanceClaudeTurns(state);
    events.push(...claudeEvents);
    await saveDispute(state);
    if (state.finalized) break;
  }
  await saveDispute(state);
  return { events, state: publicState(state) };
}

export function publicState(state: DisputeState) {
  return {
    dispute_id: state.dispute_id,
    scenario_id: state.scenario_id,
    turn: state.turn,
    current_round: state.current_round,
    max_rounds: state.max_rounds,
    finalized: !!state.finalized,
    bundle: state.finalized?.bundle ?? null,
    ruling: state.ruling ?? null,
    history_count: state.history.length,
    pending_feedback: state.pending_feedback,
  };
}
