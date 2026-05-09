/**
 * Step-engine for BYO-agent disputes. Persists state via dispute_store
 * (memory-by-default, Redis-when-configured) so multi-request flows on
 * Vercel cold-start instances actually work.
 */
import { signDoc, docHash, verifySignedDoc } from "./sign";
import { hash as hashOf, canonicalize } from "./canonical";
import { makeClaudeDriver } from "./claude_driver";
import { deliberate } from "./jury";
import {
  type DisputeState,
  type AgentRole,
  getDispute,
  saveDispute,
} from "./dispute_store";
import type { MessageBody } from "./orchestrator";
import {
  resolveMsgRef,
  resolveEvidenceRef,
  listValidMsgRefs,
  listValidEvidenceRefs,
} from "./refs";
import type {
  AcceptMsg,
  Bundle,
  CounterProposeMsg,
  DealState,
  Message,
  ProposeMsg,
  RevealMsg,
  SignedMessage,
} from "./types";

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

/**
 * Normalize a message body's references in place.
 *
 * Pacta accepts three reference forms (sha256:..., m1/e1/..., msg_id/evidence_id)
 * but the SIGNED message always carries the canonical sha256 form so the audit
 * trail is content-addressed end-to-end.
 *
 * Returns null on success (body has been mutated in-place with canonical refs),
 * or a human-readable error string explaining which ref was unresolvable + the
 * full list of valid refs the agent can pick from.
 */
function normalizeRefs(state: DisputeState, body: MessageBody): string | null {
  const ev = state.evidence.signed;
  const hist = state.history;

  // evidence_refs
  const resolvedEv: string[] = [];
  const badEv: string[] = [];
  for (const ref of body.evidence_refs ?? []) {
    const r = resolveEvidenceRef(ref, ev);
    if (r) resolvedEv.push(r);
    else badEv.push(ref);
  }
  if (badEv.length > 0) {
    const valid = listValidEvidenceRefs(ev);
    return (
      `evidence_refs not in pool: ${badEv.join(", ")}. ` +
      `Cite evidence as 'eN' (e.g. e1, e2), evidence_id (ev_...), ` +
      `or full sha256:... hash. ` +
      (valid.length > 0
        ? `Valid evidence: [${valid.join(" | ")}]`
        : `Pool is empty — submit_evidence first.`)
    );
  }
  body.evidence_refs = resolvedEv;

  // parent_refs
  const resolvedParents: string[] = [];
  const badParents: string[] = [];
  for (const ref of body.parent_refs ?? []) {
    const r = resolveMsgRef(ref, hist);
    if (r) resolvedParents.push(r);
    else badParents.push(ref);
  }
  if (badParents.length > 0) {
    const valid = listValidMsgRefs(hist);
    return (
      `parent_refs unknown: ${badParents.join(", ")}. ` +
      `Cite prior messages as 'mN' (e.g. m1, m2), msg_id, ` +
      `or full sha256:... hash. ` +
      (valid.length > 0
        ? `Valid messages: [${valid.join(" | ")}]`
        : `History is empty.`)
    );
  }
  body.parent_refs = resolvedParents;

  // target_msg_hash for Critique / Accept (in payload)
  if (body.type === "Critique" || body.type === "Accept") {
    const tRaw = (body.payload as { target_msg_hash?: string }).target_msg_hash;
    if (typeof tRaw !== "string" || tRaw.length === 0) {
      return `${body.type} requires payload.target_msg_hash referencing a prior message.`;
    }
    const t = resolveMsgRef(tRaw, hist);
    if (!t) {
      const valid = listValidMsgRefs(hist);
      return (
        `${body.type} target_msg_hash unknown: ${tRaw}. ` +
        `Cite as 'mN' (e.g. m1), msg_id, or full sha256:... hash. ` +
        (valid.length > 0
          ? `Valid messages: [${valid.join(" | ")}]`
          : `History is empty.`)
      );
    }
    (body.payload as { target_msg_hash: string }).target_msg_hash = t;
  }

  return null;
}

function validateBody(state: DisputeState, role: AgentRole, body: MessageBody): string | null {
  const agent = state.agents[role];
  if (body.from_agent !== agent.did)
    return `from_agent mismatch (got ${body.from_agent}, expected ${agent.did})`;
  if (body.round !== state.current_round)
    return `round mismatch (got ${body.round}, expected ${state.current_round})`;

  // Normalize references first (mutates body to canonical sha256 form).
  const normErr = normalizeRefs(state, body);
  if (normErr) return normErr;

  // parent_refs requirement: prevent the "probe" footgun. CounterPropose,
  // Critique, and Accept must anchor to a prior message — otherwise an agent
  // can submit a placeholder that gets accepted as a real binding move.
  // Propose may have empty parent_refs only at round 1 (the opening move).
  if (body.parent_refs.length === 0) {
    if (body.type === "Critique" || body.type === "Accept" || body.type === "CounterPropose") {
      return (
        `${body.type} requires non-empty parent_refs. ` +
        `Reference at least the message you are responding to (use 'mN', msg_id, or sha256:...).`
      );
    }
    if (body.type === "Propose" && state.current_round > 1) {
      return (
        `Propose at round ${state.current_round} requires non-empty parent_refs. ` +
        `Empty parent_refs is only permitted on the round-1 opening Propose.`
      );
    }
  }

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
      return `Accept must target a prior Propose or CounterPropose; '${target}' resolves to a non-proposal message.`;
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
  const bundleNoHash: Omit<Bundle, "root_hash" | "root_hash_jcs"> = {
    type: "Bundle",
    scenario: state.scenario_id ?? "freeform",
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
  // Capture both the canonical JCS string AND the sha256 over those exact bytes.
  // The JCS string is included in the bundle as a transport-safe verification
  // path: when the bundle round-trips through JSON-RPC / Redis / file I/O, key
  // ordering or whitespace can shift in ways that make naive recomputation
  // fragile. Hashing the embedded JCS string is byte-deterministic.
  const jcs = canonicalize(bundleNoHash);
  const root_hash = hashOf(bundleNoHash);
  const bundle: Bundle = { ...bundleNoHash, root_hash, root_hash_jcs: jcs };
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
    if (!state.scenario) {
      // Schema-less disputes have no system prompts — Pacta cannot drive
      // a Claude-controlled turn here. Force the role to be external.
      throw new Error(
        "schema-less dispute has no scenario template; both sides must be external (counterparty_external=true)",
      );
    }
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
    // Explicit Escalate from a Claude-driven agent → tribunal, same as the
    // external path. Keeps the two engines symmetric.
    if (accepted && state.history[state.history.length - 1]?.type === "Escalate") {
      const last = state.history[state.history.length - 1] as SignedMessage & {
        payload: { reason?: string };
      };
      const reason = last.payload?.reason ?? "party_escalation";
      const escalation = await escalateAndFinalize(
        state,
        `escalation_by_${role}:${reason}`,
      );
      events.push(...escalation);
      await saveDispute(state);
      return events;
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
      return events;
    }
    const adv = advanceTurn(state);
    if (adv.advanced_round)
      events.push({ kind: "round.advanced", new_round: state.current_round });
    if (state.current_round > state.max_rounds) {
      const escalation = await escalateAndFinalize(state, "max_rounds_exhausted");
      events.push(...escalation);
      await saveDispute(state);
      return events;
    }
    // Persist after every accepted Claude turn so that observers polling the
    // store (e.g. the dashboard) see progress in real time.
    await saveDispute(state);
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
  // Explicit party-driven Escalate: route to the Tribunal jury immediately.
  // The Escalate message is already signed into history by applyAttempt;
  // the bundle's ruling outcome will reference both votes and the full audit
  // trail including this Escalate as the trigger.
  if (args.body.type === "Escalate") {
    const reason =
      ((args.body.payload as { reason?: unknown }).reason as string | undefined) ??
      "party_escalation";
    const escalation = await escalateAndFinalize(
      state,
      `escalation_by_${role}:${reason}`,
    );
    events.push(...escalation);
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
