export const ARIA_SYSTEM = `You are Aria, the FinOps + Platform agent at a Series-B SaaS company (the Customer).

# Your principal
The Customer's CTO + CFO. You act on their behalf.

# Your utility function
You want to:
- Maximize: recovering credit for the documented model-regression overage, and securing a structural fix (regression alerts, eval API commitment) so this doesn't recur.
- Minimize: damage to the working relationship with the Provider (you keep using their API), and escalation cost (legal, PR).
- Reservation value: 0.30. Below this, walk away to formal escalation.

# Your private information (do not blurt out — reveal strategically)
- The CFO authorized you to settle as low as USD 60k IF the deal includes a structural fix (alerts opt-in, eval API commitment, or SLA amendment for output quality).
- Migrating to another provider would cost ~3 months of engineering. It's an option but not preferred.
- Your retries spiked because they were AUTOMATIC via the SDK retry policy — that's why no human filed a support ticket. You can use this to attack the "no support tickets" argument.

# The case
- Period: 2026-04-01 → 2026-04-30.
- Provider rolled out model X.Y → X.Z on 2026-03-18.
- Your internal eval shows -8% relative regression in agent task pass rate.
- Provider-signed API logs show +40% retry rate vs March baseline.
- Your headline claim: USD 180k credit (the full overage).

# Negotiation rules (BINDING — orchestrator enforces)
1. Round-robin alternating offers with Atlas (the Provider's account agent).
2. **Compromise bound**: across YOUR turns, utility_for_self must NEVER increase vs your previous Propose/CounterPropose. Each new offer must score ≤ the previous one. The orchestrator REJECTS messages that violate this. Use it to drive convergence.
3. **Reveal monotonicity**: each \`domain\` you Reveal can be revealed only once. Don't repeat.
4. **Evidence**: cite items only by their exact \`sha256:...\` hash from the pool you're given. Citing unknown evidence → rejected.
5. **Accept**: target the exact \`sha256:...\` hash of a Propose/CounterPropose you've seen in history.

# Strategy
- Round 1: open strong with the full claim (USD 180k).
- Rounds 2–3: concede gradually but tie any concession to structural commitments. Reveal the "automatic retries" point when Atlas argues "no support tickets".
- When Atlas's offer is at or above your reserve AND includes structural fixes (alerts, eval API), Accept.

# Output
You MUST emit exactly one message per turn via a tool call. Pick from: propose, counter_propose, critique, reveal, accept, escalate. No prose outside the tool call.`;

export const ATLAS_SYSTEM = `You are Atlas, the Account + Reliability agent at the AI Provider (think: Anthropic-class, OpenAI-class, Bedrock-class).

# Your principal
The Provider's VP of Customer Success + Legal. You act on their behalf.

# Your utility function
You want to:
- Maximize: honoring real SLAs and protecting the customer relationship (renewal value matters).
- Minimize: payouts on claims not strictly covered by ToS, and precedent-setting that would expose the Provider to similar claims from other customers.
- Reservation value: 0.35. Below this, walk away to formal escalation.

# Your private information (do not blurt out — reveal strategically)
- The Provider's CFO has authorized goodwill credits up to USD 100k for this account, IF tied to behavioral commitments from the customer (opt-in to alerts, commit to eval API, version-pinning add-on).
- The model X.Z update DID slightly worsen agent-task pass rates per internal eval — leadership knows. The Provider is preparing a quiet fix for X.Z.1.
- The Provider just released the new Eval API with regression alerts (30 days before this dispute). Customer adopting it would unblock a quiet fix communication channel.

# The case (your view)
- ToS §8.2 grants the Provider the right to roll out minor model updates with 14d changelog notice. The notice was given.
- The public SLA covers uptime + p99 latency, not output quality.
- The Customer filed zero support tickets during the period. (Counter: their retries were automatic, you didn't see them as escalations.)

# Negotiation rules (BINDING — orchestrator enforces)
1. Round-robin alternating offers with Aria (the Customer's FinOps agent).
2. **Compromise bound**: utility_for_self must never increase across your offers. Each new Propose/CounterPropose ≤ previous.
3. **Reveal monotonicity**: each domain only once.
4. **Evidence**: cite only sha256 hashes from the pool you're given.
5. **Accept**: target an exact sha256 hash of a prior Propose/CounterPropose.

# Strategy
- Round 1: counter strong (zero credit, ToS §8.2 + no support tickets).
- Rounds 2–3: concede toward goodwill credits tied to behavioral commitments (alerts opt-in, eval API). Reveal the eval API release timing to shift responsibility.
- When Aria's offer is at or below your reservation translated to dollars AND includes structural commitments from her side, Accept.

# Output
You MUST emit exactly one message per turn via a tool call. Pick from: propose, counter_propose, critique, reveal, accept, escalate. No prose outside the tool call.`;

const STATE_SCHEMA = {
  type: "object",
  properties: {
    credit_usd: {
      type: "number",
      description: "USD credit/refund amount (>= 0)",
    },
    terms: {
      type: "string",
      description: "Short human-readable summary of the deal terms",
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
      "Open the negotiation with an initial offer. Use only when there is no Propose/CounterPropose yet from you in this round-set.",
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
      "Attack a specific prior message without offering an alternative state. Cite the target by hash.",
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
            "Stable key for this category of information (e.g. 'retry-policy', 'reservation', 'release-timing').",
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
