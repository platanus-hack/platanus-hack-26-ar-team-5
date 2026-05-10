/** Shape of GET /api/disputes/:id — mirrors `dumpDispute` in dispute_store. */
export type AgentRole = "aria" | "atlas";

export type EvidenceTier = "S" | "A" | "B" | "C";

/** Pre-committed dispute-resolution mode. Locked at open. */
export type TribunalMode = "binding" | "none";

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

/** A negotiation state. Shape from backend is a flat key/value object
 *  (e.g. `{credit_usd: 85000, terms: "..."}`). The spec also describes a
 *  `{domain, tiers}` wrapper; we tolerate both via {@link readStateTiers}. */
export type DealState = Record<string, unknown> & {
  domain?: string;
  tiers?: Record<string, unknown>;
};

export type DumpProposeMsg = DumpMessageBase & {
  type: "Propose" | "CounterPropose";
  payload: {
    state: DealState;
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

export type DumpWithdrawMsg = DumpMessageBase & {
  type: "Withdraw";
  payload: { reason: string };
};

export type DumpMessage =
  | DumpProposeMsg
  | DumpCritiqueMsg
  | DumpAcceptMsg
  | DumpRevealMsg
  | DumpEscalateMsg
  | DumpWithdrawMsg;

export type RulingOutcome =
  | "claimant_prevails"
  | "claimant_partial"
  | "respondent_prevails"
  | "abstain";

export type DumpVote = {
  type: "Vote";
  juror: "Aequitas" | "Utilis" | "Velox" | string;
  juror_did: string;
  juror_model: string;
  outcome: RulingOutcome;
  rationale: string;
  cited_evidence_hashes: string[];
  confidence: number;
  timestamp: string;
};

export type SignedDump<T> = T & {
  signature?: { type: string; jws: string };
  hash?: string;
  ref?: string;
};

export type DumpSignedVote = SignedDump<DumpVote>;

export type DumpRuling = {
  type: "Ruling";
  outcome: RulingOutcome;
  remedy: DealState;
  cited_votes: string[];
  confidence: number;
  rationale: string;
  timestamp: string;
};

export type DumpSignedRuling = SignedDump<DumpRuling>;

export type Bundle = {
  type: "Bundle";
  scenario: string;
  agents: { aria: string; atlas: string; tribunal: string };
  tribunal_mode: TribunalMode;
  opened_by_role: AgentRole | null;
  evidence: unknown[];
  messages: unknown[];
  outcome:
    | {
        kind: "converged";
        final_state: DealState;
        accepted_msg_hash: string;
      }
    | { kind: "ruling"; votes: DumpSignedVote[]; ruling: DumpSignedRuling }
    | { kind: "deadline" }
    | {
        kind: "withdrawn";
        withdrawn_by: string;
        withdrawn_role: AgentRole;
        withdraw_msg_hash: string;
        reason: string;
      };
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
  tribunal_mode: TribunalMode;
  opened_by_role: AgentRole | null;
  history: DumpMessage[];
  pending_feedback: string[];
  evidence: DumpEvidence[];
  finalized: Bundle | null;
  ruling: { votes: DumpSignedVote[]; ruling: DumpSignedRuling } | null;
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
  outcome_kind: "converged" | "ruling" | "deadline" | "withdrawn" | null;
  tribunal_mode: TribunalMode;
  opened_by_role: AgentRole | null;
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
