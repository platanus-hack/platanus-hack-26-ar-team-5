/**
 * In-memory dispute store for Phase-2 BYO-agent MCP flows.
 *
 * Each open dispute has: scenario, agent identities (DIDs), evidence pool,
 * signed-message history, and a per-role token used to authorize submit_message.
 * State lives on globalThis so it survives across MCP tool calls within the
 * same warm Vercel instance. Cold starts wipe state — for the demo and for
 * single-session use this is acceptable; Vercel KV is the upgrade path.
 */
import { bootAgents, type AgentBook } from "./agents.js";
import { buildEvidencePool, type EvidencePool } from "./fixtures.js";
import {
  runNegotiation,
  type LLMDriver,
  type MessageBody,
  type OrchestratorEvent,
} from "./orchestrator.js";
import { makeClaudeDriver } from "./claude_driver.js";
import { deliberate } from "./jury.js";
import { docHash } from "./sign.js";
import { hash as hashOf } from "./canonical.js";
import { getScenario, type Scenario } from "./scenarios/index.js";
import type {
  Bundle,
  SignedEvidence,
  SignedMessage,
  SignedRuling,
  SignedVote,
} from "./types.js";

export type AgentRole = "aria" | "atlas";

export type DisputeState = {
  dispute_id: string;
  scenario_id: string;
  scenario: Scenario;
  agents: AgentBook;
  evidence: EvidencePool;
  history: SignedMessage[];
  /**
   * For each role, who plays it. "external" means an outside MCP client controls it
   * via submit_message; "claude" means we drive it with the live Claude driver
   * inside this server when the role's turn comes up.
   */
  controllers: Record<AgentRole, "external" | "claude">;
  /** Per-role bearer tokens issued at open/join. */
  role_tokens: Record<AgentRole, string>;
  /** Whether each external role has been claimed yet (first-come-first-served). */
  claimed: Record<AgentRole, boolean>;
  /** Round-robin turn pointer — whose turn to act next. */
  turn: AgentRole;
  current_round: number;
  max_rounds: number;
  /** Tracks rejection feedback to surface to the next submit_message attempt. */
  pending_feedback: string[];
  /** Settled state at end-of-life. */
  finalized?: {
    bundle: Bundle;
  };
  /** Most recent jury votes / ruling once a Tribunal deliberation has run. */
  ruling?: { votes: SignedVote[]; ruling: SignedRuling };
  created_at: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __pacta_disputes: Map<string, DisputeState> | undefined;
}

function store(): Map<string, DisputeState> {
  if (!globalThis.__pacta_disputes) {
    globalThis.__pacta_disputes = new Map();
  }
  return globalThis.__pacta_disputes;
}

function randId(prefix: string): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  let h = "";
  for (const b of bytes) h += b.toString(16).padStart(2, "0");
  return `${prefix}_${h}`;
}

export type OpenDisputeResult = {
  dispute_id: string;
  scenario: Scenario;
  agents: { aria: string; atlas: string; tribunal: string };
  evidence_summary: Array<{ id: string; tier: string; submitter: string; hash: string }>;
  your_role: AgentRole;
  your_token: string;
  /** DID the external agent should use as `from_agent` when submitting messages. */
  your_did: string;
  /** Counterparty DID (for parent_refs / Accept targets). */
  counterparty_did: string;
  /**
   * If true, the other side is also external — both players must
   * submit_message via MCP. If false, we drive the other side with
   * Claude after each external submission.
   */
  counterparty_external: boolean;
  /** When counterparty_external=true, the second role's token is included so the
   *  opener can hand it to the other client. In production this would be a
   *  separate `join_dispute` flow; for the demo this is the simplest UX. */
  counterparty_token?: string;
  next_to_act: AgentRole;
  current_round: number;
};

export function openDispute(args: {
  scenario_id: string;
  your_role: AgentRole;
  /** If true, the OTHER side will also be controlled externally (both BYO). Defaults false → Claude plays the other side. */
  counterparty_external?: boolean;
  max_rounds?: number;
}): OpenDisputeResult {
  const scenario = getScenario(args.scenario_id);
  const agents = bootAgents();
  const evidence = buildEvidencePool(agents, scenario);
  const dispute_id = randId("dsp");
  const your_role = args.your_role;
  const other_role: AgentRole = your_role === "aria" ? "atlas" : "aria";
  const counterparty_external = args.counterparty_external === true;

  const controllers: Record<AgentRole, "external" | "claude"> = {
    aria: "claude",
    atlas: "claude",
  };
  controllers[your_role] = "external";
  if (counterparty_external) controllers[other_role] = "external";

  const role_tokens: Record<AgentRole, string> = {
    aria: randId("tok"),
    atlas: randId("tok"),
  };
  // The opener claims their own role; the other external slot stays open until joined.
  const claimed: Record<AgentRole, boolean> = {
    aria: controllers.aria === "external" && your_role === "aria",
    atlas: controllers.atlas === "external" && your_role === "atlas",
  };

  const state: DisputeState = {
    dispute_id,
    scenario_id: scenario.id,
    scenario,
    agents,
    evidence,
    history: [],
    controllers,
    role_tokens,
    claimed,
    turn: "aria",
    current_round: 1,
    max_rounds: args.max_rounds ?? 5,
    pending_feedback: [],
    created_at: new Date().toISOString(),
  };
  store().set(dispute_id, state);

  return {
    dispute_id,
    scenario,
    agents: {
      aria: agents.aria.did,
      atlas: agents.atlas.did,
      tribunal: agents.tribunal.did,
    },
    evidence_summary: evidence.signed.map((e) => ({
      id: e.evidence_id,
      tier: e.tier,
      submitter: e.submitter,
      hash: docHash(e),
    })),
    your_role,
    your_token: role_tokens[your_role],
    your_did: agents[your_role].did,
    counterparty_did: agents[other_role].did,
    counterparty_external,
    next_to_act: state.turn,
    current_round: state.current_round,
  };
}

export type JoinDisputeResult = {
  dispute_id: string;
  scenario: Scenario;
  agents: { aria: string; atlas: string; tribunal: string };
  evidence_summary: Array<{ id: string; tier: string; submitter: string; hash: string }>;
  your_role: AgentRole;
  your_token: string;
  your_did: string;
  counterparty_did: string;
  next_to_act: AgentRole;
  current_round: number;
};

/** Claim an externally-controlled role on an existing dispute. First-come-first-served. */
export function joinDispute(args: { dispute_id: string; role: AgentRole }): JoinDisputeResult {
  const s = store().get(args.dispute_id);
  if (!s) throw new Error(`unknown dispute: ${args.dispute_id}`);
  if (s.controllers[args.role] !== "external")
    throw new Error(`role '${args.role}' is not externally controlled in this dispute`);
  if (s.claimed[args.role])
    throw new Error(`role '${args.role}' has already been claimed in this dispute`);
  s.claimed[args.role] = true;
  const other: AgentRole = args.role === "aria" ? "atlas" : "aria";
  return {
    dispute_id: s.dispute_id,
    scenario: s.scenario,
    agents: {
      aria: s.agents.aria.did,
      atlas: s.agents.atlas.did,
      tribunal: s.agents.tribunal.did,
    },
    evidence_summary: s.evidence.signed.map((e) => ({
      id: e.evidence_id,
      tier: e.tier,
      submitter: e.submitter,
      hash: docHash(e),
    })),
    your_role: args.role,
    your_token: s.role_tokens[args.role],
    your_did: s.agents[args.role].did,
    counterparty_did: s.agents[other].did,
    next_to_act: s.turn,
    current_round: s.current_round,
  };
}

export function getDispute(dispute_id: string): DisputeState {
  const s = store().get(dispute_id);
  if (!s) throw new Error(`unknown dispute: ${dispute_id}`);
  return s;
}

/** Public, redacted view (no keypairs) for clients. */
export function dumpDispute(dispute_id: string) {
  const s = getDispute(dispute_id);
  return {
    dispute_id: s.dispute_id,
    scenario_id: s.scenario_id,
    agents: {
      aria: s.agents.aria.did,
      atlas: s.agents.atlas.did,
      tribunal: s.agents.tribunal.did,
    },
    controllers: s.controllers,
    turn: s.turn,
    current_round: s.current_round,
    max_rounds: s.max_rounds,
    history: s.history,
    pending_feedback: s.pending_feedback,
    evidence: s.evidence.signed,
    finalized: s.finalized?.bundle ?? null,
    ruling: s.ruling ?? null,
  };
}
