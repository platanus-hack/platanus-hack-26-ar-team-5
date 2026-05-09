/**
 * Pacta protocol types — message primitives, evidence, bundle.
 * The shape is the on-the-wire JSON we sign over (via JCS canonical bytes).
 */

export type EvidenceTier = "S" | "A" | "B" | "C";

export type Proof = {
  type: "Ed25519Signature2020";
  created: string; // ISO-8601 timestamp
  verificationMethod: string; // did:key:... (the signer's DID)
  signature: string; // hex-encoded Ed25519 signature
};

export type SignedDoc<T> = T & { proof: Proof };

export type Evidence = {
  type: "Evidence";
  evidence_id: string; // human-readable id (e.g. "evi-msa-3.4")
  submitter: string; // DID of the agent that signed it
  tier: EvidenceTier;
  title: string;
  body: string; // human-readable summary (the "content")
  produced_at: string; // ISO timestamp
};
export type SignedEvidence = SignedDoc<Evidence>;

export type DealState = {
  credit_usd: number;
  terms: string;
};

export type MessageType =
  | "Propose"
  | "Critique"
  | "CounterPropose"
  | "Accept"
  | "Reveal"
  | "Escalate";

type MessageBase = {
  msg_id: string;
  round: number;
  from_agent: string; // DID
  type: MessageType;
  timestamp: string; // ISO
  evidence_refs: string[]; // sha256:... hashes pointing into the evidence pool
  parent_refs: string[]; // sha256:... hashes of prior messages this attaches to
};

export type ProposeMsg = MessageBase & {
  type: "Propose";
  payload: {
    state: DealState;
    rationale: string;
    utility_for_self: number; // ∈ [0, 1]
  };
};

export type CounterProposeMsg = MessageBase & {
  type: "CounterPropose";
  payload: {
    state: DealState;
    rationale: string;
    utility_for_self: number;
  };
};

export type CritiqueMsg = MessageBase & {
  type: "Critique";
  payload: {
    target_msg_hash: string;
    rationale: string;
  };
};

export type AcceptMsg = MessageBase & {
  type: "Accept";
  payload: {
    target_msg_hash: string; // hash of the Propose/CounterPropose accepted
  };
};

export type RevealMsg = MessageBase & {
  type: "Reveal";
  payload: {
    domain: string; // a stable key, used for monotonicity check
    information: string;
  };
};

export type EscalateMsg = MessageBase & {
  type: "Escalate";
  payload: {
    reason: string;
    requested_action: "mediator" | "deadline_extension";
  };
};

export type Message =
  | ProposeMsg
  | CounterProposeMsg
  | CritiqueMsg
  | AcceptMsg
  | RevealMsg
  | EscalateMsg;

export type SignedMessage = SignedDoc<Message>;

export type Vote = {
  type: "Vote";
  juror: "Aequitas" | "Utilis" | "Velox";
  juror_did: string;
  juror_model: string;
  outcome:
    | "claimant_prevails"
    | "claimant_partial"
    | "respondent_prevails"
    | "abstain";
  rationale: string;
  cited_evidence_hashes: string[];
  confidence: number; // ∈ [0, 1]
  timestamp: string;
};
export type SignedVote = SignedDoc<Vote>;

export type Ruling = {
  type: "Ruling";
  outcome: Vote["outcome"];
  remedy: DealState;
  cited_votes: string[]; // hashes of the Vote docs
  confidence: number; // % of agreement among jurors
  rationale: string;
  timestamp: string;
};
export type SignedRuling = SignedDoc<Ruling>;

export type Bundle = {
  type: "Bundle";
  scenario: string;
  agents: { aria: string; atlas: string; tribunal: string }; // DIDs
  evidence: SignedEvidence[];
  messages: SignedMessage[];
  outcome:
    | { kind: "converged"; final_state: DealState; accepted_msg_hash: string }
    | { kind: "deadline" }
    | { kind: "ruling"; votes: SignedVote[]; ruling: SignedRuling };
  root_hash: string; // sha256 over the canonical bundle (excluding root_hash + root_hash_jcs)
  /** Canonical RFC 8785 JCS string of the bundle minus root_hash + root_hash_jcs.
   *  Hashing this string is byte-deterministic — verifiers should use it
   *  as the primary verification path when present (it survives any number of
   *  JSON round-trips through transport / storage / serialization layers).
   *  Optional for backward compatibility with bundles built by older versions. */
  root_hash_jcs?: string;
  created_at: string;
};
