/**
 * Anthropic tools shared across scenarios. Per-scenario system prompts and
 * mock scripts live in src/scenarios/<id>.ts.
 */

const STATE_SCHEMA = {
  type: "object",
  properties: {
    credit_usd: {
      type: "number",
      description:
        "Numeric coverage / credit envelope. In money-bound cases this is USD; in non-monetary cases (e.g. healthcare authorization) it encodes the coverage envelope (0=baseline, max=full prescription).",
    },
    terms: {
      type: "string",
      description: "Short human-readable summary of the deal/treatment terms.",
    },
  },
  required: ["credit_usd", "terms"],
} as const;

const COMMON_REFS = {
  evidence_refs: {
    type: "array",
    items: { type: "string" },
    description:
      "List of sha256:... hashes of evidence items from the pool. Empty array if none.",
  },
  parent_refs: {
    type: "array",
    items: { type: "string" },
    description:
      "List of sha256:... hashes of prior messages in history this attaches to. Empty array if none.",
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
        state: STATE_SCHEMA,
        rationale: { type: "string" },
        utility_for_self: { type: "number" },
      },
      required: [
        "evidence_refs",
        "parent_refs",
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
        target_msg_hash: {
          type: "string",
          description: "sha256:... hash of the prior message you are attacking.",
        },
        rationale: { type: "string" },
      },
      required: ["evidence_refs", "parent_refs", "target_msg_hash", "rationale"],
    },
  },
  {
    name: "accept",
    description:
      "Accept a prior Propose/CounterPropose. Target it by its exact sha256:... hash.",
    input_schema: {
      type: "object",
      properties: {
        ...COMMON_REFS,
        target_msg_hash: { type: "string" },
      },
      required: ["evidence_refs", "parent_refs", "target_msg_hash"],
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
        domain: {
          type: "string",
          description:
            "Stable key for this category of information (e.g. 'retry-policy', 'biomarker', 'release-timing').",
        },
        information: { type: "string" },
      },
      required: ["evidence_refs", "parent_refs", "domain", "information"],
    },
  },
  {
    name: "escalate",
    description: "Request mediator intervention or deadline extension.",
    input_schema: {
      type: "object",
      properties: {
        ...COMMON_REFS,
        reason: { type: "string" },
        requested_action: {
          type: "string",
          enum: ["mediator", "deadline_extension"],
        },
      },
      required: ["evidence_refs", "parent_refs", "reason", "requested_action"],
    },
  },
] as const;
