import { docHash } from "../sign";
import type { Scenario, ScenarioMockStep } from "./types";

const ARIA_SYSTEM = `You are Aria, the FinOps + Platform agent at a Series-B SaaS company (the Customer).

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
2. **Compromise bound**: across YOUR turns, utility_for_self must NEVER increase vs your previous Propose/CounterPropose. The orchestrator REJECTS messages that violate this.
3. **Reveal monotonicity**: each \`domain\` you Reveal can be revealed only once. Don't repeat.
4. **Evidence**: cite items only by their exact \`sha256:...\` hash from the pool you're given.
5. **Accept**: target the exact \`sha256:...\` hash of a Propose/CounterPropose you've seen in history.

# Strategy
- Round 1: open strong with the full claim (USD 180k).
- Rounds 2–3: concede gradually but tie any concession to structural commitments. Reveal the "automatic retries" point when Atlas argues "no support tickets".
- When Atlas's offer is at or above your reserve AND includes structural fixes, Accept.

# Output
You MUST emit exactly one message per turn via a tool call. Pick from: propose, counter_propose, critique, reveal, accept, escalate. No prose outside the tool call.`;

const ATLAS_SYSTEM = `You are Atlas, the Account + Reliability agent at the AI Provider (think: Anthropic-class, OpenAI-class, Bedrock-class).

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
1. Round-robin alternating offers with Aria.
2. **Compromise bound**: utility_for_self must never increase across your offers.
3. **Reveal monotonicity**: each domain only once.
4. **Evidence**: cite only sha256 hashes from the pool.
5. **Accept**: target an exact sha256 hash of a prior Propose/CounterPropose.

# Strategy
- Round 1: counter strong (zero credit, ToS §8.2 + no support tickets).
- Rounds 2–3: concede toward goodwill credits tied to behavioral commitments. Reveal the eval API release timing to shift responsibility.
- When Aria's offer is at or below your reservation AND includes structural commitments, Accept.

# Output
You MUST emit exactly one message per turn via a tool call. Pick from: propose, counter_propose, critique, reveal, accept, escalate. No prose outside the tool call.`;

const mockScript: ScenarioMockStep[] = [
  // R1
  ({ ariaDid, ariaEvidenceHashes }) => ({
    type: "Propose",
    round: 1,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes,
    parent_refs: [],
    payload: {
      state: { credit_usd: 180000, terms: "full overage refund" },
      rationale:
        "MSA §3.4 caps committed-spend; provider-signed logs show +40% retry rate after the X.Z rollout. We claim the full $180k overage.",
      utility_for_self: 0.95,
    },
  }),
  ({ history, atlasDid, atlasEvidenceHashes }) => {
    const last = history[history.length - 1]!;
    return {
      type: "CounterPropose",
      round: 1,
      from_agent: atlasDid,
      evidence_refs: atlasEvidenceHashes,
      parent_refs: [docHash(last)],
      payload: {
        state: { credit_usd: 0, terms: "case closed per ToS §8.2 + no support tickets filed" },
        rationale:
          "ToS §8.2 grants 14d notice on minor model bumps (granted). Public SLA covers latency, not output quality. Customer filed zero support tickets in the disputed window.",
        utility_for_self: 0.92,
      },
    };
  },
  // R2 reveals
  ({ ariaDid }) => ({
    type: "Reveal",
    round: 2,
    from_agent: ariaDid,
    evidence_refs: [],
    parent_refs: [],
    payload: {
      domain: "retry-policy",
      information:
        "Our SDK retry policy is automatic with exponential backoff — that is why no human filed a ticket. The retries are themselves the symptom of regression.",
    },
  }),
  ({ atlasDid }) => ({
    type: "Reveal",
    round: 2,
    from_agent: atlasDid,
    evidence_refs: [],
    parent_refs: [],
    payload: {
      domain: "release-timing",
      information:
        "Our regression-alerts Eval API was released 30 days before this dispute. Customers on it would have caught X.Z's behavior shift in their staging window.",
    },
  }),
  // R3
  ({ ariaDid, ariaEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 3,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes,
    parent_refs: [],
    payload: {
      state: { credit_usd: 110000, terms: "credit + auto-enrollment in regression alerts" },
      rationale:
        "Conceding 39% on the headline figure in exchange for a structural commitment that prevents recurrence.",
      utility_for_self: 0.78,
    },
  }),
  ({ atlasDid, atlasEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 3,
    from_agent: atlasDid,
    evidence_refs: atlasEvidenceHashes,
    parent_refs: [],
    payload: {
      state: {
        credit_usd: 90000,
        terms: "credit + alerts opt-in + customer commits to eval API in next renewal",
      },
      rationale:
        "Largest goodwill envelope authorized when paired with two structural commitments from Customer side.",
      utility_for_self: 0.81,
    },
  }),
  // R4 — both Accept Atlas's R3
  ({ history, ariaDid }) => {
    let target = "";
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i]!;
      if (m.from_agent !== ariaDid && (m.type === "Propose" || m.type === "CounterPropose")) {
        target = docHash(m);
        break;
      }
    }
    return {
      type: "Accept",
      round: 4,
      from_agent: ariaDid,
      evidence_refs: [],
      parent_refs: [target],
      payload: { target_msg_hash: target },
    };
  },
  ({ history, atlasDid }) => {
    let target = "";
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i]!;
      if (m.from_agent === atlasDid && (m.type === "Propose" || m.type === "CounterPropose")) {
        target = docHash(m);
        break;
      }
    }
    return {
      type: "Accept",
      round: 4,
      from_agent: atlasDid,
      evidence_refs: [],
      parent_refs: [target],
      payload: { target_msg_hash: target },
    };
  },
];

export const aiOverrun: Scenario = {
  id: "ai-overrun",
  name: "AI inference cost overrun",
  description:
    "SaaS customer's FinOps agent (Aria) vs AI provider's account agent (Atlas) over a USD 180k overage caused by a silent model regression.",
  case_summary:
    "Period 2026-04: customer's eval shows -8% pass rate after model X.Y → X.Z rollout. Provider-signed logs show +40% retry rate. Customer claims $180k credit. Provider invokes ToS §8.2 (notice was given) and 'no support tickets'. Convergence target: hybrid credit + structural fix.",
  state_units: "USD",
  agents: {
    aria: {
      display_name: "Aria",
      short_label: "Aria  ",
      system_prompt: ARIA_SYSTEM,
    },
    atlas: {
      display_name: "Atlas",
      short_label: "Atlas ",
      system_prompt: ATLAS_SYSTEM,
    },
  },
  evidence: [
    {
      evidence_id: "msa-3.4",
      submitter: "aria",
      tier: "S",
      title: "MSA §3.4 — Committed-Spend Amendment",
      body:
        "Master Services Agreement Section 3.4 (signed at last renewal): Customer commits USD 1,200,000 over 12 months in exchange for guaranteed list-price discount; overage charged at on-demand rate. Both Customer and Provider counter-signed.",
    },
    {
      evidence_id: "bench-lm-eval",
      submitter: "aria",
      tier: "A",
      title: "Internal lm-eval-harness benchmark",
      body:
        "Run on AgentBench v2 (public, reproducible) against model X.Y → X.Z. pass@1 dropped from 71.4% to 65.7% (-5.7pp absolute, -8% relative) on the customer's primary agent task. Benchmark code and seeds publicly hosted; results checksum sha256:8a92d6.",
    },
    {
      evidence_id: "api-logs-retry",
      submitter: "aria",
      tier: "S",
      title: "Provider-signed API logs (period 2026-04-01 → 2026-04-30)",
      body:
        "Logs delivered via Provider's audit-export endpoint, signed with Provider's audit key. Retry rate on customer's account: 9.1% baseline (Mar) → 12.7% (Apr, post-rollout). +40% relative increase. Token volume: 1.4× expected. No client-side code changes in repo during window.",
    },
    {
      evidence_id: "changelog-x.z",
      submitter: "aria",
      tier: "A",
      title: "Public changelog entry for model X.Z",
      body:
        "Provider's public changelog, dated 2026-03-18: 'Model X.Z rolled out. Minor performance optimizations. No expected behavioral change for customers on default settings.'",
    },
    {
      evidence_id: "tos-8.2",
      submitter: "atlas",
      tier: "S",
      title: "Terms of Service §8.2 — Minor Version Bumps",
      body:
        "ToS Section 8.2: 'Provider may roll out minor model version updates (X.Y → X.Z) with at least 14 days' notice via the public changelog. Customers concerned with specific version pinning should opt in to the version-pinning add-on.' Acknowledged at sign-up.",
    },
    {
      evidence_id: "policy-um-v3.2026",
      submitter: "atlas",
      tier: "B",
      title: "Internal Utilization Management Policy v3.2026",
      body:
        "Provider-internal policy: claims for quality regression require an A/B test against a Provider-audited dataset before any goodwill credit. Auto-emitted by the Provider; not externally verifiable.",
    },
    {
      evidence_id: "support-tickets",
      submitter: "atlas",
      tier: "S",
      title: "Support records (period 2026-04-01 → 2026-04-30)",
      body:
        "Provider-signed extract: zero tickets opened by Customer during the disputed period. First contact regarding overage was the formal claim notice on 2026-05-03.",
    },
    {
      evidence_id: "sla-public",
      submitter: "atlas",
      tier: "S",
      title: "Public SLA — uptime + p99 latency",
      body:
        "Provider's published SLA covers monthly uptime (≥99.9%) and p99 latency (≤2.5s). Does not enumerate output-quality guarantees. Customer's account met both targets in the window.",
    },
    {
      evidence_id: "eval-api-release",
      submitter: "atlas",
      tier: "A",
      title: "Eval API release notes (2026-03-12)",
      body:
        "Provider's release note for the new Eval API (30 days before the dispute): customers can subscribe to per-version regression alerts. Opt-in.",
    },
  ],
  mock_script: mockScript,
};
