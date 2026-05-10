/**
 * Pacta protocol types — message primitives, evidence, bundle.
 * The shape is the on-the-wire JSON we sign over (via JCS canonical bytes).
 */

import type { Amendment } from "./state_schema";

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

/**
 * Negotiation state. Shape is declared by the SCENARIO (see `state_schema.ts`)
 * and validated by the orchestrator at sign-time. The protocol itself is
 * domain-agnostic — `DealState` is a generic bag of fields. The schema embedded
 * in the bundle tells a downstream auditor how to interpret these keys.
 *
 * Every state carries an `amendments[]` slot (possibly empty). Mid-flight
 * extensions land here via Amend → Accept(counterparty), giving the protocol
 * a structured way for parties to invent clauses the schema didn't anticipate
 * without smuggling unknown keys into the signed payload.
 *
 * Legacy USD-credit scenarios use `{ credit_usd, terms, amendments }`.
 * Oncology uses `{ coverage_envelope_usd, regimen, duration_months, stop_rules, amendments }`.
 * Schema-less BYO disputes get a permissive default schema.
 */
export type DealState = Record<string, unknown> & {
  amendments?: Amendment[];
};

export type MessageType =
  | "Propose"
  | "Critique"
  | "CounterPropose"
  | "Accept"
  | "Reveal"
  | "Escalate"
  | "Withdraw"
  | "Amend";

/**
 * How an unresolved dispute terminates.
 *
 * - `binding`: classic Pacta. If bilateral negotiation deadlocks or
 *   max_rounds elapses, the 3-LLM Tribunal renders a signed Ruling that
 *   binds both parties (like an arbitration clause).
 * - `none`: parties refused to pre-commit to the Tribunal. Escalate is
 *   rejected; max_rounds finalizes the bundle as `kind: "deadline"`
 *   (no remedy, no winner). Either party can `Withdraw` at any time.
 *
 * Mode is fixed at open and cannot be changed mid-flight — the joiner sees
 * it before deciding whether to claim their role.
 */
export type TribunalMode = "binding" | "none";

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
    target_msg_hash: string; // hash of the Propose/CounterPropose/Amend accepted
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

/** Unilateral exit. Either party can sign a Withdraw at any point —
 *  finalizes the dispute with `outcome.kind="withdrawn"`. The audit trail
 *  shows who walked and why. No tribunal, no remedy. */
export type WithdrawMsg = MessageBase & {
  type: "Withdraw";
  payload: {
    reason: string;
  };
};

/** Schema-extension primitive. Either party can propose a new clause
 *  (a key + value the schema didn't anticipate). The amendment "applies"
 *  only when the COUNTERPARTY signs an Accept on this AmendMsg's hash —
 *  self-Accept doesn't count. Once applied, future Propose/CounterPropose
 *  states are expected to include the clause in `state.amendments[]`.
 *
 *  The orchestrator records the application as an audit fact; it does not
 *  silently mutate proposals. Agents declare their amendments[] explicitly. */
export type AmendMsg = MessageBase & {
  type: "Amend";
  payload: {
    /** Field name being introduced (must NOT collide with declared schema keys). */
    key: string;
    /** Free-form value associated with the new clause. */
    value: unknown;
    /** Why this clause matters. Goes into the audit trail. */
    rationale: string;
  };
};

export type Message =
  | ProposeMsg
  | CounterProposeMsg
  | CritiqueMsg
  | AcceptMsg
  | RevealMsg
  | EscalateMsg
  | WithdrawMsg
  | AmendMsg;

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

/** Schema metadata embedded in the bundle. Lets a third-party auditor read
 *  `final_state` / `remedy` without assuming USD or any other domain — the
 *  shape is self-describing and cryptographically pinned via `ref`. */
export type BundleStateSchema = {
  /** sha256 over canonical JSON-Schema bytes. */
  ref: string;
  /** Short label, e.g. "USD-credit", "oncology-coverage". */
  domain: string;
  /** Human-readable one-line description. */
  description: string;
  /** Full JSON-Schema fragment for `state` / `remedy`. */
  json_schema: Record<string, unknown>;
};

export type Bundle = {
  type: "Bundle";
  /** Bundle format version. v1 = legacy (no state_schema); v2 = adds
   *  embedded state_schema and Amend message support. Older readers can
   *  still parse v2 bundles by ignoring the schema field. */
  bundle_version: 1 | 2;
  scenario: string;
  agents: { aria: string; atlas: string; tribunal: string }; // DIDs
  /** Pre-committed dispute-resolution mode (set at open, immutable). */
  tribunal_mode: TribunalMode;
  /** Which role called open_dispute and chose the tribunal_mode. The mode is
   *  asymmetric: an opener picking `none` offloads risk onto the joiner. We
   *  bake (role, mode) into the bundle so any downstream auditor can score
   *  whether a given DID systematically opens disputes under `none` to
   *  disadvantage their counterparty. `null` for demo-seeded disputes — the
   *  operator picked the mode, not a real party, so attribution is undefined. */
  opened_by_role: "aria" | "atlas" | null;
  /** State-schema metadata. Optional for v1 bundles; required for v2. Embedded
   *  (not just ref'd) so the bundle is self-contained for offline auditing. */
  state_schema?: BundleStateSchema;
  evidence: SignedEvidence[];
  messages: SignedMessage[];
  outcome:
    | { kind: "converged"; final_state: DealState; accepted_msg_hash: string }
    | { kind: "deadline" }
    | { kind: "ruling"; votes: SignedVote[]; ruling: SignedRuling }
    | {
        kind: "withdrawn";
        withdrawn_by: string; // DID of the party that walked
        withdrawn_role: "aria" | "atlas";
        withdraw_msg_hash: string;
        reason: string;
      };
  root_hash: string; // sha256 over the canonical bundle (excluding root_hash + root_hash_jcs)
  /** Canonical RFC 8785 JCS string of the bundle minus root_hash + root_hash_jcs.
   *  Hashing this string is byte-deterministic — verifiers should use it
   *  as the primary verification path when present (it survives any number of
   *  JSON round-trips through transport / storage / serialization layers).
   *  Optional for backward compatibility with bundles built by older versions. */
  root_hash_jcs?: string;
  created_at: string;
};
