/**
 * Anthropic tools shared across scenarios. Per-scenario system prompts and
 * mock scripts live in src/scenarios/<id>.ts. Per-scenario state shape is
 * declared in `state_schema` on the scenario; the negotiation tools here
 * accept any object shape and the orchestrator validates against the
 * scenario's schema in sign-time. The agent learns the actual shape from
 * its system prompt + the schema embedded in the user prompt.
 */

const STATE_SCHEMA = {
  type: "object",
  description:
    "State payload. Shape is declared by the SCENARIO's state_schema (see your system prompt and the User prompt's '## State schema' block). " +
    "Unknown top-level keys are rejected by the orchestrator — use the 'amendments' array to introduce mid-flight clauses the schema didn't anticipate. " +
    "Always include 'amendments' (default []).",
  additionalProperties: true,
} as const;

const COMMON_REFS = {
  evidence_refs: {
    type: "array",
    items: { type: "string" },
    description:
      "List of evidence references from the pool. Each entry may be: 'eN' (e.g. 'e1', 'e2'), the evidence_id ('ev_...'), or a full 'sha256:...' hash. Empty array if none.",
  },
  parent_refs: {
    type: "array",
    items: { type: "string" },
    description:
      "List of references to prior messages in history this attaches to. Each entry may be: 'mN' (e.g. 'm1', 'm2'), the msg_id (32-hex), or a full 'sha256:...' hash. " +
      "MUST be non-empty for Critique/CounterPropose/Accept. Propose may be empty only at round 1.",
  },
} as const;

const SUMMARY_FIELD = {
  summary: {
    type: "string",
    description:
      "REQUIRED. 2–4 word characterisation of THIS move for the dashboard / audit log. Examples: 'Demands full refund', 'Counters with $600', 'Cites force majeure', 'Escalates to tribunal', 'Accepts $600 deal'. Hard-capped at 60 chars. Keep it glanceable, not prose.",
  },
} as const;

export const TOOLS = [
  {
    name: "propose",
    description:
      "Open the negotiation with an initial offer.",
    input_schema: {
      type: "object",
      properties: {
        ...COMMON_REFS,
        ...SUMMARY_FIELD,
        state: STATE_SCHEMA,
        rationale: {
          type: "string",
          description: "1–3 sentence justification anchored in evidence.",
        },
        utility_for_self: {
          type: "number",
          description:
            "Your subjective utility in [0,1]. MUST be ≤ your previous Propose/CounterPropose utility (compromise bound).",
        },
      },
      required: [
        "evidence_refs",
        "parent_refs",
        "summary",
        "state",
        "rationale",
        "utility_for_self",
      ],
    },
  },
  {
    name: "counter_propose",
    description: "Reject the current proposal and offer an alternative state.",
    input_schema: {
      type: "object",
      properties: {
        ...COMMON_REFS,
        ...SUMMARY_FIELD,
        state: STATE_SCHEMA,
        rationale: { type: "string" },
        utility_for_self: { type: "number" },
      },
      required: [
        "evidence_refs",
        "parent_refs",
        "summary",
        "state",
        "rationale",
        "utility_for_self",
      ],
    },
  },
  {
    name: "critique",
    description:
      "Attack a specific prior message without offering an alternative state.",
    input_schema: {
      type: "object",
      properties: {
        ...COMMON_REFS,
        ...SUMMARY_FIELD,
        target_msg_hash: {
          type: "string",
          description:
            "Reference to the prior message you are attacking — either 'mN' (e.g. 'm1'), the msg_id, or full 'sha256:...' hash.",
        },
        rationale: { type: "string" },
      },
      required: ["evidence_refs", "parent_refs", "summary", "target_msg_hash", "rationale"],
    },
  },
  {
    name: "accept",
    description:
      "Accept a prior Propose/CounterPropose to converge, or accept a prior Amend to ratify a mid-flight clause. Target it by 'mN', msg_id, or sha256:... hash.",
    input_schema: {
      type: "object",
      properties: {
        ...COMMON_REFS,
        ...SUMMARY_FIELD,
        target_msg_hash: {
          type: "string",
          description:
            "Reference to the Propose/CounterPropose/Amend you accept — 'mN', msg_id, or sha256:... hash.",
        },
      },
      required: ["evidence_refs", "parent_refs", "summary", "target_msg_hash"],
    },
  },
  {
    name: "reveal",
    description:
      "Disclose a piece of private information. Each `domain` may be revealed only once per agent.",
    input_schema: {
      type: "object",
      properties: {
        ...COMMON_REFS,
        ...SUMMARY_FIELD,
        domain: {
          type: "string",
          description:
            "Stable key for this category of information (e.g. 'retry-policy', 'biomarker', 'release-timing').",
        },
        information: { type: "string" },
      },
      required: ["evidence_refs", "parent_refs", "summary", "domain", "information"],
    },
  },
  {
    name: "escalate",
    description: "Request mediator intervention or deadline extension.",
    input_schema: {
      type: "object",
      properties: {
        ...COMMON_REFS,
        ...SUMMARY_FIELD,
        reason: { type: "string" },
        requested_action: {
          type: "string",
          enum: ["mediator", "deadline_extension"],
        },
      },
      required: ["evidence_refs", "parent_refs", "summary", "reason", "requested_action"],
    },
  },
  {
    name: "amend",
    description:
      "Propose a NEW clause not in the schema. The amendment becomes binding only when the COUNTERPARTY Accepts your Amend's hash. Use this for cláusulas the schema didn't anticipate (e.g. mid-flight 'imaging cadence at month 5' for an oncology plan). Self-Accept is a no-op for amendments — only the counterparty's Accept applies.",
    input_schema: {
      type: "object",
      properties: {
        ...COMMON_REFS,
        ...SUMMARY_FIELD,
        key: {
          type: "string",
          description:
            "Field name being introduced. Must NOT collide with a declared schema field (those go through propose/counter_propose).",
        },
        value: {
          description:
            "Free-form value associated with the new clause. Any JSON-serializable shape.",
        },
        rationale: { type: "string" },
      },
      required: ["evidence_refs", "parent_refs", "summary", "key", "value", "rationale"],
    },
  },
] as const;
