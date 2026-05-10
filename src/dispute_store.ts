/**
 * Dispute store façade. Backed by `src/storage.ts` (memory-by-default,
 * Redis-when-configured). All accessors are async.
 *
 * Two ways to open a dispute:
 *  - schema-less: pass a free-form `claim` string. Pacta gives you the table
 *    (signed messages, compromise bound, jury, audit trail). Both parties
 *    bring their own positions, system prompts, evidence.
 *  - template: pass a `scenario_id` from our bundled library. Pacta pre-loads
 *    that scenario's evidence pool. Useful for canned demos.
 */
import { docHash, signDoc } from "./sign";
import { hash as hashOf } from "./canonical";
import { getScenario, type Scenario } from "./scenarios/index";
import {
  deleteDispute as deleteLive,
  freshAgents,
  listDisputes as listLive,
  listDisputeIds,
  loadDispute,
  saveDispute as saveLive,
  type LiveDispute,
  type AgentRole,
} from "./storage";
import { buildEvidencePool, type EvidencePool } from "./fixtures";
import type { Evidence, EvidenceTier, SignedEvidence, TribunalMode } from "./types";

export type { AgentRole, LiveDispute as DisputeState } from "./storage";

function randId(prefix: string): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  let h = "";
  for (const b of bytes) h += b.toString(16).padStart(2, "0");
  return `${prefix}_${h}`;
}

export type OpenDisputeArgs = {
  /** Free-form description of what's being disputed. Required when scenario_id is absent. */
  claim?: string;
  /** ~5-word headline of the case for at-a-glance dashboards and audit logs.
   *  Optional but strongly recommended — without it, dashboards fall back to
   *  truncating `claim` (which can be a paragraph). Hard-capped to 60 chars. */
  context_summary?: string;
  /** Bundled scenario template id. Pre-loads its evidence + system prompts. Required if claim is absent. */
  scenario_id?: string;
  your_role: AgentRole;
  counterparty_external?: boolean;
  max_rounds?: number;
  /** Pre-commit dispute-resolution mode. `binding` (default) routes deadlocks
   *  to a 3-LLM Tribunal whose ruling binds both parties. `none` opts out:
   *  Escalate is rejected and max_rounds finalizes the bundle as deadline
   *  (no remedy). Either party can always Withdraw. */
  tribunal_mode?: TribunalMode;
};

const CONTEXT_SUMMARY_MAX = 60;
const MOVE_SUMMARY_MAX = 60;

function normalizeSummary(
  s: string | undefined | null,
  max: number,
): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new Error(
      `summary too long: ${trimmed.length} chars (max ${max}). ` +
        `Keep it ≤ ${max} characters — it's a glanceable label, not prose.`,
    );
  }
  return trimmed;
}

export { normalizeSummary, CONTEXT_SUMMARY_MAX, MOVE_SUMMARY_MAX };

/** JSON-safe view of a state schema, stripped of the runtime zod object. */
export type StateSchemaView = {
  ref: string;
  domain: string;
  description: string;
  json_schema: Record<string, unknown>;
  aggregations: Record<string, "median" | "majority" | "intersect" | "first">;
};

function stateSchemaView(scenario: Scenario | null): StateSchemaView | null {
  const s = scenario?.state_schema;
  if (!s) return null;
  return {
    ref: s.ref,
    domain: s.domain,
    description: s.description,
    json_schema: s.jsonSchema,
    aggregations: s.aggregations,
  };
}

export type OpenDisputeResult = {
  dispute_id: string;
  claim: string | null;
  context_summary: string | null;
  scenario: Scenario | null;
  /** JSON-safe schema metadata. The joiner inspects this BEFORE claiming a
   *  role to consent to the shape of states and remedies in this dispute. */
  state_schema: StateSchemaView | null;
  agents: { aria: string; atlas: string; tribunal: string };
  evidence_summary: Array<{ id: string; tier: string; submitter: string; hash: string }>;
  your_role: AgentRole;
  your_token: string;
  your_did: string;
  counterparty_did: string;
  counterparty_external: boolean;
  tribunal_mode: TribunalMode;
  next_to_act: AgentRole;
  current_round: number;
};

export async function openDispute(args: OpenDisputeArgs): Promise<OpenDisputeResult> {
  if (!args.scenario_id && !args.claim) {
    throw new Error("open_dispute requires either scenario_id or claim (or both)");
  }
  // context_summary is mandatory in the protocol — it's the dashboard label and
  // audit headline. normalizeSummary throws on >60 chars; we throw here on missing.
  const context_summary = normalizeSummary(args.context_summary, CONTEXT_SUMMARY_MAX);
  if (!context_summary) {
    throw new Error(
      "open_dispute requires `context_summary` — a 5-ish word headline of the case " +
        "(e.g. 'Cloud SLA outage refund'). Hard-capped at 60 chars.",
    );
  }
  const tribunal_mode: TribunalMode = args.tribunal_mode ?? "binding";
  if (tribunal_mode !== "binding" && tribunal_mode !== "none") {
    throw new Error(
      `tribunal_mode must be 'binding' or 'none' (got '${tribunal_mode}')`,
    );
  }
  const scenario = args.scenario_id ? getScenario(args.scenario_id) : null;
  const { agents, agent_keys } = freshAgents();
  const created_at = new Date().toISOString();
  const evidence: EvidencePool = scenario
    ? buildEvidencePool(agents, scenario, created_at)
    : { signed: [], byEvidenceId: new Map(), byHash: new Map() };
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
  const claimed: Record<AgentRole, boolean> = {
    aria: controllers.aria === "external" && your_role === "aria",
    atlas: controllers.atlas === "external" && your_role === "atlas",
  };

  const live: LiveDispute = {
    dispute_id,
    claim: args.claim ?? null,
    context_summary,
    scenario_id: scenario ? scenario.id : null,
    signed_evidence: evidence.signed,
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
    tribunal_mode,
    opened_by_role: your_role,
    pending_feedback: [],
    finalized: null,
    ruling: null,
    created_at,
    agent_keys,
    version: 0,
  };
  await saveLive(live);

  return {
    dispute_id,
    claim: live.claim,
    context_summary: live.context_summary ?? null,
    scenario,
    state_schema: stateSchemaView(scenario),
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
    tribunal_mode,
    next_to_act: live.turn,
    current_round: live.current_round,
  };
}

export type JoinDisputeResult = {
  dispute_id: string;
  claim: string | null;
  context_summary: string | null;
  scenario: Scenario | null;
  /** State-schema metadata. By calling join_dispute the joiner CONSENTS to
   *  this schema as the contract — every Propose/CounterPropose state and the
   *  Tribunal's Ruling.remedy will be validated against it. Inspect before
   *  claiming a role: schemas with overly-permissive or biased fields are
   *  observable here and rejectable by simply not joining. */
  state_schema: StateSchemaView | null;
  agents: { aria: string; atlas: string; tribunal: string };
  evidence_summary: Array<{ id: string; tier: string; submitter: string; hash: string }>;
  your_role: AgentRole;
  your_token: string;
  your_did: string;
  counterparty_did: string;
  /** Mode the opener pre-committed to. The joiner sees this BEFORE deciding
   *  whether to claim a role — under `none` there's no tribunal failsafe. */
  tribunal_mode: TribunalMode;
  next_to_act: AgentRole;
  current_round: number;
};

export async function joinDispute(args: {
  dispute_id: string;
  role: AgentRole;
}): Promise<JoinDisputeResult> {
  const s = await loadDispute(args.dispute_id);
  if (!s) throw new Error(`unknown dispute: ${args.dispute_id}`);
  if (s.controllers[args.role] !== "external")
    throw new Error(`role '${args.role}' is not externally controlled in this dispute`);
  if (s.claimed[args.role])
    throw new Error(`role '${args.role}' has already been claimed in this dispute`);
  s.claimed[args.role] = true;
  await saveLive(s);
  const other: AgentRole = args.role === "aria" ? "atlas" : "aria";
  return {
    dispute_id: s.dispute_id,
    claim: s.claim,
    context_summary: s.context_summary ?? null,
    scenario: s.scenario,
    state_schema: stateSchemaView(s.scenario),
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
    tribunal_mode: s.tribunal_mode,
    next_to_act: s.turn,
    current_round: s.current_round,
  };
}

export type SubmitEvidenceArgs = {
  dispute_id: string;
  role_token: string;
  evidence: { tier: EvidenceTier; title: string; body: string; evidence_id?: string };
};

export type SubmitEvidenceResult = {
  evidence_id: string;
  hash: string;
  signed: SignedEvidence;
};

/** Append a piece of signed evidence to an open dispute. The role identified
 *  by role_token signs the evidence with their private key (so the audit trail
 *  shows WHO submitted it). */
export async function submitEvidence(args: SubmitEvidenceArgs): Promise<SubmitEvidenceResult> {
  const s = await loadDispute(args.dispute_id);
  if (!s) throw new Error(`unknown dispute: ${args.dispute_id}`);
  if (s.finalized) throw new Error("dispute is already finalized");
  // Identify the role by token (either party can submit evidence at any time
  // — evidence isn't bound to a turn).
  let submitterRole: AgentRole | null = null;
  for (const r of ["aria", "atlas"] as AgentRole[]) {
    if (s.role_tokens[r] === args.role_token) submitterRole = r;
  }
  if (!submitterRole) throw new Error("role_token mismatch — token does not match either party");
  const submitter = s.agents[submitterRole];
  const now = new Date().toISOString();
  const evidence_id = args.evidence.evidence_id ?? randId("ev");
  const evidence: Evidence = {
    type: "Evidence",
    evidence_id,
    submitter: submitter.did,
    tier: args.evidence.tier,
    title: args.evidence.title,
    body: args.evidence.body,
    produced_at: now,
  };
  const signed = signDoc(evidence, submitter.keypair, submitter.did, now);
  const h = hashOf(signed);
  // Append to the live evidence pool (and re-index).
  s.evidence.signed.push(signed);
  s.evidence.byEvidenceId.set(evidence_id, signed);
  s.evidence.byHash.set(h, signed);
  await saveLive(s);
  return { evidence_id, hash: h, signed };
}

export async function getDispute(dispute_id: string): Promise<LiveDispute> {
  const s = await loadDispute(dispute_id);
  if (!s) throw new Error(`unknown dispute: ${dispute_id}`);
  return s;
}

/** Public, redacted view (no keypairs / no agent_keys) for clients.
 *  Each history entry is augmented with `hash` (canonical sha256 used for
 *  parent_refs / target_msg_hash) and `ref` (short 'mN' reference). Each
 *  evidence entry gets the same treatment with 'eN'. */
export async function dumpDispute(dispute_id: string) {
  const s = await getDispute(dispute_id);
  const history = s.history.map((m, i) => ({
    ...m,
    hash: docHash(m),
    ref: `m${i + 1}`,
  }));
  const evidence = s.evidence.signed.map((e, i) => ({
    ...e,
    hash: docHash(e),
    ref: `e${i + 1}`,
  }));
  // Embed the state-schema metadata so a JOINER (who has not yet claimed a
  // role) can inspect the shape of every Propose/CounterPropose state and the
  // tribunal's Ruling.remedy BEFORE consenting to the dispute. Schema is the
  // contract — opener proposes it, joiner consents by claiming.
  const schema = s.scenario?.state_schema;
  const state_schema = schema
    ? {
        ref: schema.ref,
        domain: schema.domain,
        description: schema.description,
        json_schema: schema.jsonSchema,
        aggregations: schema.aggregations,
      }
    : null;
  return {
    dispute_id: s.dispute_id,
    claim: s.claim,
    context_summary: s.context_summary ?? null,
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
    tribunal_mode: s.tribunal_mode,
    opened_by_role: s.opened_by_role,
    state_schema,
    history,
    pending_feedback: s.pending_feedback,
    evidence,
    finalized: s.finalized?.bundle ?? null,
    ruling: s.ruling ?? null,
    /** How to cite history / evidence in submit_message. Refs are resolved
     *  server-side to canonical sha256 before the message is signed. */
    references_help: {
      messages:
        "Cite a prior message in parent_refs / target_msg_hash via: " +
        "'mN' (e.g. m1, m2 — chronological index, 1-based), " +
        "msg_id (32-hex), or full sha256:... hash.",
      evidence:
        "Cite an evidence item in evidence_refs via: " +
        "'eN' (e.g. e1, e2), evidence_id (ev_...), or full sha256:... hash.",
    },
  };
}

export const saveDispute = saveLive;
export const deleteDispute = deleteLive;
export { listDisputeIds };

/** Open a dispute that's fully Claude-driven on both sides. Used by the
 *  dashboard demo seeder so an observer can watch a complete negotiation
 *  unfold without acting as either party. */
export async function openDemoDispute(args: {
  scenario_id: string;
  max_rounds?: number;
  tribunal_mode?: TribunalMode;
}): Promise<{
  dispute_id: string;
  scenario: Scenario;
  tribunal_mode: TribunalMode;
  created_at: string;
}> {
  const tribunal_mode: TribunalMode = args.tribunal_mode ?? "binding";
  if (tribunal_mode !== "binding" && tribunal_mode !== "none") {
    throw new Error(
      `tribunal_mode must be 'binding' or 'none' (got '${tribunal_mode}')`,
    );
  }
  const scenario = getScenario(args.scenario_id);
  const { agents, agent_keys } = freshAgents();
  const created_at = new Date().toISOString();
  const evidence = buildEvidencePool(agents, scenario, created_at);
  const dispute_id = randId("dsp");
  const live: LiveDispute = {
    dispute_id,
    claim: null,
    context_summary: scenario.name ?? null,
    scenario_id: scenario.id,
    signed_evidence: evidence.signed,
    scenario,
    agents,
    evidence,
    history: [],
    controllers: { aria: "claude", atlas: "claude" },
    role_tokens: { aria: randId("tok"), atlas: randId("tok") },
    claimed: { aria: false, atlas: false },
    turn: "aria",
    current_round: 1,
    max_rounds: args.max_rounds ?? 5,
    tribunal_mode,
    // Demo seeder: no real human-mapped opener picked the mode. The dashboard
    // operator did, but they're not a party — leave null so auditors don't
    // attribute the mode choice to either Aria or Atlas.
    opened_by_role: null,
    pending_feedback: [],
    finalized: null,
    ruling: null,
    created_at,
    agent_keys,
    version: 0,
  };
  await saveLive(live);
  return { dispute_id, scenario, tribunal_mode, created_at };
}

export type DisputeSummary = {
  dispute_id: string;
  scenario_id: string | null;
  claim: string | null;
  context_summary: string | null;
  created_at: string;
  current_round: number;
  max_rounds: number;
  turn: AgentRole;
  history_count: number;
  evidence_count: number;
  finalized: boolean;
  outcome_kind: "converged" | "ruling" | "deadline" | "withdrawn" | null;
  tribunal_mode: TribunalMode;
  opened_by_role: AgentRole | null;
  controllers: Record<AgentRole, "external" | "claude">;
  agents: { aria: string; atlas: string };
};

/** List every dispute in storage as a compact summary suitable for the
 *  dashboard sidebar. Sorted newest-first by `created_at`. */
export async function listDisputeSummaries(): Promise<DisputeSummary[]> {
  const all = await listLive();
  const summaries: DisputeSummary[] = all.map((s) => ({
    dispute_id: s.dispute_id,
    scenario_id: s.scenario_id,
    claim: s.claim,
    context_summary: s.context_summary ?? null,
    created_at: s.created_at,
    current_round: s.current_round,
    max_rounds: s.max_rounds,
    turn: s.turn,
    history_count: s.history.length,
    evidence_count: s.evidence.signed.length,
    finalized: !!s.finalized,
    outcome_kind: s.finalized?.bundle.outcome.kind ?? null,
    tribunal_mode: s.tribunal_mode,
    opened_by_role: s.opened_by_role,
    controllers: s.controllers,
    agents: { aria: s.agents.aria.did, atlas: s.agents.atlas.did },
  }));
  summaries.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return summaries;
}
