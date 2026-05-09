/** Shape of GET /api/disputes/:id — mirrors `dumpDispute` in dispute_store. */
export type AgentRole = "aria" | "atlas";

export type EvidenceTier = "S" | "A" | "B" | "C";

export type DumpEvidence = {
  type: "Evidence";
  evidence_id: string;
  submitter: string;
  tier: EvidenceTier;
  title: string;
  body: string;
  produced_at: string;
  hash: string;
  ref: string;
};

export type DumpMessageBase = {
  msg_id: string;
  from_agent: string;
  round: number;
  parent_refs: string[];
  evidence_refs: string[];
  timestamp: string;
  hash: string;
  ref: string;
};

export type DumpProposeMsg = DumpMessageBase & {
  type: "Propose" | "CounterPropose";
  payload: {
    state: { domain: string; tiers: Record<string, unknown> };
    utility_for_self: number;
    rationale: string;
  };
};

export type DumpCritiqueMsg = DumpMessageBase & {
  type: "Critique";
  payload: { target_msg_hash: string; rationale: string };
};

export type DumpAcceptMsg = DumpMessageBase & {
  type: "Accept";
  payload: { target_msg_hash: string; rationale?: string };
};

export type DumpRevealMsg = DumpMessageBase & {
  type: "Reveal";
  payload: { domain: string; commitment: unknown; rationale: string };
};

export type DumpEscalateMsg = DumpMessageBase & {
  type: "Escalate";
  payload: { rationale: string };
};

export type DumpMessage =
  | DumpProposeMsg
  | DumpCritiqueMsg
  | DumpAcceptMsg
  | DumpRevealMsg
  | DumpEscalateMsg;

export type Bundle = {
  type: "Bundle";
  scenario: string;
  agents: { aria: string; atlas: string; tribunal: string };
  evidence: unknown[];
  messages: unknown[];
  outcome:
    | {
        kind: "converged";
        final_state: { domain: string; tiers: Record<string, unknown> };
        accepted_msg_hash: string;
      }
    | { kind: "ruling"; votes: unknown[]; ruling: unknown }
    | { kind: "deadline" };
  created_at: string;
  root_hash: string;
  root_hash_jcs?: string;
};

export type DisputeDump = {
  dispute_id: string;
  claim: string | null;
  scenario_id: string | null;
  agents: { aria: string; atlas: string; tribunal: string };
  controllers: Record<AgentRole, "external" | "claude">;
  turn: AgentRole;
  current_round: number;
  max_rounds: number;
  history: DumpMessage[];
  pending_feedback: string[];
  evidence: DumpEvidence[];
  finalized: Bundle | null;
  ruling: { votes: unknown[]; ruling: unknown } | null;
  references_help?: { messages: string; evidence: string };
};

export type DisputeSummary = {
  dispute_id: string;
  scenario_id: string | null;
  claim: string | null;
  created_at: string;
  current_round: number;
  max_rounds: number;
  turn: AgentRole;
  history_count: number;
  evidence_count: number;
  finalized: boolean;
  outcome_kind: "converged" | "ruling" | "deadline" | null;
  controllers: Record<AgentRole, "external" | "claude">;
  agents: { aria: string; atlas: string };
};

export type ScenarioMeta = {
  id: string;
  name: string;
  description: string;
};

export type DisputeListResponse = {
  disputes: DisputeSummary[];
  scenarios: ScenarioMeta[];
};
