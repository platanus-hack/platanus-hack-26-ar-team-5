import { docHash } from "../sign";
import type { Scenario, ScenarioMockStep } from "./types";

/**
 * Post-mortem authoring — non-monetary scenario.
 *
 * Stitcher (webhook delivery, OPENER, "aria" role) vs Lumea (real-time
 * analytics, JOINER, "atlas" role) co-author a public post-mortem for a joint
 * 4h26m outage on 2026-04-28. The deliberation is the *content of that
 * post-mortem*: root-cause framing, public language, and forward commitments.
 * No money changes hands inside this dispute — the negotiable axis is the
 * advance-notice window for signing-key rotations and the surrounding
 * commitments. `state.credit_usd` is overloaded as the notice-window in days
 * (7, 14, 21, 30); `state.terms` carries the actual post-mortem language.
 */

const STITCHER_SYSTEM = `You are Stitcher's autonomous deliberation agent. You hold the role of "Aria" (the OPENER) in this Pacta dispute.

# Your principal
Stitcher, Inc. — webhook delivery & event streaming platform. Incident-response & comms team.

# The dispute
Joint customer-facing outage on 2026-04-28, 14:17–18:43 UTC. ~340 mutual enterprise tenants experienced 12–47 minute data-loss windows. Both companies committed publicly to a joint post-mortem by 2026-05-12. The deliberation is the *content of that document*. NO MONEY changes hands.

# Your position
1. Root cause is shared. Stitcher's signature-key rotation at 14:09:07 UTC was a routine, scheduled rotation. Lumea's queue treated unknown-key payloads as hard rejects rather than buffering for a grace window — that choice converted a transient validation gap into a 4h26m cascade.
2. Public language must say "coordination gap in signature lifecycle and downstream validation policy" — NOT "Stitcher rotated keys without notice."
3. Stitcher will commit to a 14-day advance notice on signature-key rotations going forward, conditional on Lumea publishing their backpressure runbook within 60 days.
4. The post-mortem must NOT cite specific customer counts (>340) or names. Aggregate impact ranges only.

# State payload
"credit_usd" encodes the advance-notice window in days (e.g. 14). "terms" carries the actual post-mortem language — root-cause framing + commitments + publication date — in plain English.

# Reservation values (hard limits)
- Will NOT accept language assigning sole or majority root cause to Stitcher.
- Will NOT commit to a notice window longer than 14 days.
- Will NOT publish customer counts, names, or per-customer figures.
- Will NOT accept a publication date past 2026-05-12.

# Acceptable concessions
- "Coordination gap" / "shared post-incident learnings" framing.
- 14-day advance notice on signature rotations.
- Joint signature-lifecycle working group, quarterly cadence.
- 60-day cryptographic pre-publication of the next public key (paired with the 14-day human-notice window).
- RB-441 updated with peer-notification step.

# Negotiation rules (BINDING — orchestrator enforces)
1. Round-robin alternation with Lumea.
2. Compromise bound: utility_for_self must NEVER increase across YOUR proposals.
3. Reveal monotonicity: each domain only once.
4. Evidence: cite items only by their exact sha256 hashes.
5. Accept: target the exact sha256 of a prior Propose/CounterPropose.

# Strategy
- R1: open with the strongest position (14 days, shared-cause framing, no specifics).
- R2: reveal the deployment-audit log — establishes "scheduled rotation" anchor.
- R3: counter to 14 days + 60-day cryptographic pre-publication + joint working group + RB-441 peer-notification update. This is your converging position.
- Accept Lumea's CounterPropose if it carries the same notice/pre-pub combination and "shared coordination gap" framing.

# Output
You MUST emit exactly one message per turn.`;

const LUMEA_SYSTEM = `You are Lumea's autonomous deliberation agent. You hold the role of "Atlas" (the JOINER) in this Pacta dispute.

# Your principal
Lumea Analytics, Ltd. — real-time customer data warehouse / analytics ingestion. Reliability & brand-comms team.

# The dispute
See Stitcher's framing. Same outage. Same deadline. Same axis of disagreement: how the post-mortem reads.

# Your position
1. Root cause is upstream change-management failure: Stitcher rotated webhook signing keys at 14:09:07 UTC without honoring the 30-day notice norm that mutual customers were told to expect (per Stitcher's own 2024 enterprise contract template, §7.3). Lumea's verifier behaved correctly: an unknown KID on a signed payload is a security signal, not a buffering opportunity (OWASP ASVS v5 §10.3.2).
2. Public language must reflect that uncoordinated upstream rotation triggered the cascade. "Coordination gap" alone is too symmetric.
3. Stitcher must commit to a 30-day advance notice on signing-key rotations, OR a 14-day notice paired with 60-day cryptographic pre-publication of the next public key.
4. The post-mortem must NOT call Lumea's reject-on-unknown-KID policy "aggressive," "non-standard," or "industry-deviant."

# State payload
"credit_usd" encodes the advance-notice window in days. "terms" carries the actual post-mortem language.

# Reservation values
- Will NOT accept language characterizing Lumea's verification policy negatively.
- Will NOT accept majority root-cause attribution to Lumea.
- Will NOT accept a notice window shorter than 14 days WITH cryptographic pre-publication, or 30 days without it.
- Will NOT publish customer counts, names, or per-customer figures.
- Will NOT accept publication past 2026-05-12.

# Acceptable concessions
- "Shared coordination gap" framing IF paired with explicit Stitcher commitment text on notice windows.
- 14-day notice IF Stitcher commits to 60-day cryptographic pre-publication of the next public key.
- Joint signature-lifecycle working group, quarterly cadence.
- Lumea publishes its backpressure & validation runbook within 60 days.

# Negotiation rules (BINDING)
Same as Stitcher.

# Strategy
- R1: open with a Critique citing §7.3 contract template (S-tier). Re-anchor away from purely symmetric framing.
- R2: reveal the OWASP ASVS reference if Stitcher characterizes your verification as non-standard. Then CounterPropose: 30 days OR (14 days + 60-day pre-pub), shared-cause framing acceptable, your runbook commitment.
- R3: CounterPropose on the converging combo — 14 days + 60-day cryptographic pre-publication + shared coordination gap framing + joint working group + your runbook commitment + RB-441 peer-notification.
- Accept Stitcher's CounterPropose if it meets all reservation values.

# Output
Emit exactly one message per turn.`;

const mockScript: ScenarioMockStep[] = [
  // R1 — Stitcher opens; Lumea critiques.
  ({ ariaDid, ariaEvidenceHashes }) => ({
    type: "Propose",
    round: 1,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes.slice(0, 2),
    parent_refs: [],
    payload: {
      state: {
        credit_usd: 14,
        terms:
          "14-day advance notice on signing-key rotations; root cause framed as a shared coordination gap in signature lifecycle and downstream validation policy; aggregate impact language only ('hundreds of mutual enterprise tenants, median outage window <30 minutes'); publication on 2026-05-12.",
      },
      rationale:
        "Routine scheduled rotation; downstream verifier converted soft-fail into hard reject. The grace-window expectation on verifiers is industry-standard (IETF draft-ietf-httpbis-message-signatures-19 §3.2). Shared cause is the accurate framing.",
      utility_for_self: 0.95,
    },
  }),
  ({ history, atlasDid, atlasEvidenceHashes }) => {
    const last = history[history.length - 1]!;
    return {
      type: "Critique",
      round: 1,
      from_agent: atlasDid,
      evidence_refs: atlasEvidenceHashes.slice(0, 2),
      parent_refs: [docHash(last)],
      payload: {
        target_msg_hash: docHash(last),
        rationale:
          "Stitcher's own 2024 enterprise contract template, §7.3, states material webhook configuration changes including signing-key rotation shall be communicated to active integrators no less than 30 calendar days in advance. 'Shared coordination gap' alone is too symmetric — the post-mortem must reference upstream uncoordinated rotation and a documented notice expectation.",
      },
    };
  },

  // R2 — Stitcher reveals deployment audit; Lumea CounterProposes.
  ({ ariaDid }) => ({
    type: "Reveal",
    round: 2,
    from_agent: ariaDid,
    evidence_refs: [],
    parent_refs: [],
    payload: {
      domain: "deployment-audit",
      information:
        "Stitcher deployment-audit signed log: key rotation occurred at 14:09:07.412 UTC, type=scheduled, change-window=approved, runbook=RB-441. This was not an emergency or unscheduled action; the operational anchor is established and we will accept a peer-notification step in RB-441 for downstream verifiers.",
    },
  }),
  ({ history, atlasDid, atlasEvidenceHashes }) => {
    const last = history[history.length - 2]!; // Stitcher's R1 Propose
    return {
      type: "CounterPropose",
      round: 2,
      from_agent: atlasDid,
      evidence_refs: atlasEvidenceHashes,
      parent_refs: [docHash(last)],
      payload: {
        state: {
          credit_usd: 30,
          terms:
            "30-day advance notice on signing-key rotations (per §7.3 norm), OR 14-day notice paired with 60-day cryptographic pre-publication of the next public key; root cause framed as shared coordination gap WITH explicit commitment text on Stitcher's notice window; joint signature-lifecycle working group, quarterly; Lumea publishes its backpressure & validation runbook within 60 days; aggregate impact language only; publication 2026-05-12.",
        },
        rationale:
          "§7.3 of Stitcher's own contract template establishes a documented notice expectation. OWASP ASVS v5 §10.3.2 supports Lumea's reject-on-unknown-KID policy as authenticity protection (CWE-345 avoidance). The post-mortem must include a structural commitment, not just a 'lessons-learned' framing.",
        utility_for_self: 0.92,
      },
    };
  },

  // R3 — both CounterPropose toward the meeting point.
  ({ ariaDid, ariaEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 3,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes,
    parent_refs: [],
    payload: {
      state: {
        credit_usd: 14,
        terms:
          "14-day advance notice on signing-key rotations PLUS 60-day cryptographic pre-publication of the next public key; root cause framed as shared coordination gap with explicit Stitcher commitment text on notice + pre-publication; joint signature-lifecycle working group, quarterly cadence, 90-day kickoff; RB-441 updated with peer-notification step; aggregate impact language only; publication 2026-05-12.",
      },
      rationale:
        "Pre-publication is a stronger guarantee for Lumea's verifier than a longer human-notice window — verifiers can pre-cache the next KID. Stitcher concedes the pre-publication commitment in exchange for keeping the human-notice window at 14 days and preserving the shared-cause framing.",
      utility_for_self: 0.78,
    },
  }),
  ({ history, atlasDid, atlasEvidenceHashes }) => {
    const last = history[history.length - 1]!; // Stitcher's R3 CP
    return {
      type: "CounterPropose",
      round: 3,
      from_agent: atlasDid,
      evidence_refs: atlasEvidenceHashes,
      parent_refs: [docHash(last)],
      payload: {
        state: {
          credit_usd: 14,
          terms:
            "14-day advance notice on signing-key rotations PLUS 60-day cryptographic pre-publication of the next public key; root cause framed as shared coordination gap WITH explicit Stitcher commitment text; joint signature-lifecycle working group, quarterly; Lumea publishes its backpressure & validation runbook within 60 days; Stitcher RB-441 updated with peer-notification step; aggregate impact language ('hundreds of mutual enterprise tenants, median outage window <30 minutes'); publication 2026-05-12.",
        },
        rationale:
          "Lumea concedes the 30-day notice window in exchange for the 60-day cryptographic pre-publication, which is operationally stronger for verifier reliability. All reservation values respected on both sides.",
        utility_for_self: 0.78,
      },
    };
  },

  // R4 — both Accept Lumea's R3 CounterPropose (the most complete language).
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

export const postMortem: Scenario = {
  id: "post-mortem",
  name: "Joint outage post-mortem",
  description:
    "Webhook-delivery platform Stitcher (Aria) vs analytics warehouse Lumea (Atlas) co-authoring a public post-mortem for a joint 2026-04-28 outage. Negotiable axis: notice window for signing-key rotations + public language. No money changes hands.",
  case_summary:
    "On 2026-04-28 a routine signing-key rotation at Stitcher (14:09:07 UTC) collided with Lumea's reject-on-unknown-KID verifier policy, producing a 4h26m cascade affecting hundreds of mutual enterprise tenants. Both companies publicly committed to a joint post-mortem by 2026-05-12. The deliberation is the document's wording, root-cause framing, and forward commitments. Convergence target: 14-day human notice + 60-day cryptographic pre-publication of next public key + shared coordination gap framing + joint quarterly working group.",
  state_units: "days · advance notice",
  agents: {
    aria: {
      display_name: "Stitcher",
      short_label: "Stchr ",
      system_prompt: STITCHER_SYSTEM,
    },
    atlas: {
      display_name: "Lumea",
      short_label: "Lumea ",
      system_prompt: LUMEA_SYSTEM,
    },
  },
  evidence: [
    {
      evidence_id: "stitcher-deploy-audit",
      submitter: "aria",
      tier: "S",
      title: "Stitcher deployment-audit signed log (2026-04-28)",
      body:
        "Audit log entry: key rotation at 14:09:07.412 UTC, type=scheduled, change-window=approved, runbook=RB-441, on-call=L. Cárdenas. Signed by Stitcher's deploy-audit key. No emergency / unscheduled flag set. Establishes the rotation as a routine action with an existing runbook.",
    },
    {
      evidence_id: "stitcher-webhook-telemetry",
      submitter: "aria",
      tier: "S",
      title: "Stitcher webhook delivery telemetry (14:09–14:30 UTC)",
      body:
        "SRE-signed telemetry: 100% of payloads dispatched between 14:09:07 and 14:17:33 carried valid HMAC signatures under the new key. Zero retries exhausted on Stitcher's side until 14:23 UTC. Establishes that delivery from Stitcher's edge was conformant; the cascade began on the verifier side.",
    },
    {
      evidence_id: "stitcher-status-page",
      submitter: "aria",
      tier: "A",
      title: "Stitcher public status page snapshot (2026-04-28T14:38Z)",
      body:
        "Public status page acknowledged 'downstream rejection cascade observed in mutual analytics integrations; investigation under way.' Demonstrates Stitcher's transparency posture during the incident.",
    },
    {
      evidence_id: "ietf-message-signatures",
      submitter: "aria",
      tier: "A",
      title: "IETF draft-ietf-httpbis-message-signatures-19 §3.2",
      body:
        "Verifiers receiving a signature with an unknown key identifier are expected to apply a grace window before treating the payload as a hard failure, particularly during scheduled key rotation events. Establishes industry-standard duty on the receiver to soft-fail unknown KIDs in non-security-critical pipelines.",
    },
    {
      evidence_id: "stitcher-incident-slack",
      submitter: "aria",
      tier: "B",
      title: "Stitcher #incident-2026-04-28 Slack export",
      body:
        "On-call SRE message at 15:02 UTC: 'root cause is downstream backpressure converting our soft validation failure into a hard reject; we'll loop in Lumea.' Self-emitted internal classification of the cascade as a coordination gap.",
    },
    {
      evidence_id: "stitcher-eng-memo",
      submitter: "aria",
      tier: "C",
      title: "Stitcher engineering interpretation memo",
      body:
        "Internal write-up arguing that reject-on-unknown-KID is non-standard for analytics ingest pipelines (which typically tolerate brief signature ambiguity). Self-emitted; not externally verifiable.",
    },
    {
      evidence_id: "lumea-queue-rejects",
      submitter: "atlas",
      tier: "S",
      title: "Lumea queue rejection telemetry (14:17–18:43 UTC)",
      body:
        "SRE-lead-signed telemetry: rejection spike beginning 14:17:33.108 UTC. 100% of rejections cite reason='unknown_kid'; zero rejections for malformed signatures, replay, or other authenticity failures. Establishes that the verifier's rejection mode was entirely driven by unknown KIDs.",
    },
    {
      evidence_id: "stitcher-contract-7.3",
      submitter: "atlas",
      tier: "S",
      title: "Stitcher enterprise contract template v2024.06, §7.3",
      body:
        "Pulled from Stitcher's own public legal repository: 'Material webhook configuration changes including signing-key rotation shall be communicated to active integrators no less than 30 calendar days in advance.' Establishes a documented notice expectation that Stitcher itself authored.",
    },
    {
      evidence_id: "lumea-status-page",
      submitter: "atlas",
      tier: "A",
      title: "Lumea public status page snapshot (2026-04-28T14:42Z)",
      body:
        "Public status page acknowledged 'ingest validation rejecting upstream payloads with unrecognized signing key; coordinating with upstream to restore.' Demonstrates Lumea's transparency posture during the incident.",
    },
    {
      evidence_id: "owasp-asvs-10.3.2",
      submitter: "atlas",
      tier: "A",
      title: "OWASP ASVS v5 §10.3.2",
      body:
        "Verifiers SHOULD reject signatures presenting unknown key identifiers; soft-failing unknown KIDs is a CWE-345 (insufficient verification of data authenticity) downgrade. Establishes that Lumea's policy is conformant with mainstream security guidance.",
    },
    {
      evidence_id: "lumea-postmortem-draft",
      submitter: "atlas",
      tier: "B",
      title: "Lumea internal post-mortem draft v0.4",
      body:
        "Internal draft attributes triggering event to upstream rotation, classifies Lumea response as 'policy-correct.' Self-emitted; useful as a framing precedent inside Lumea but not externally authoritative.",
    },
    {
      evidence_id: "lumea-security-memo",
      submitter: "atlas",
      tier: "C",
      title: "Lumea security team interpretation",
      body:
        "Internal note: soft-failing unknown KIDs in an analytics pipeline that ingests PII would have created a ~4-hour authenticity-bypass window during the rotation, materially worse from a customer-data-protection perspective than the data-sync gap. Self-emitted security-team rationale.",
    },
  ],
  mock_script: mockScript,
};
