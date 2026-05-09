import { docHash } from "../sign.js";
import type { Scenario, ScenarioMockStep } from "./types.js";

/**
 * Designed-deadlock scenario: structurally-incompatible reservation values
 * mean bilateral negotiation cannot close. Expected path:
 *   negotiation → max rounds without convergence → escalation → Tribunal jury rules.
 *
 * The interesting question is whether the heterogeneous jury can converge on
 * a hybrid the bilateral parties could not propose themselves under
 * compromise-bound + reservation constraints.
 */

const VEGA_SYSTEM = `You are Vega, the editorial agent at an investigative newsroom. You hold the role of "Aria" in this Pacta negotiation.

# Your principal
The newsroom's editor-in-chief + legal counsel.

# Your access
- The original leaked dossier (32 pages of internal corporate documents, allegedly).
- Source-protection commitments to a confidential whistleblower.
- A prior published series on the same industry.

# Your utility function
- Maximize: publishing the substance of the dossier with adequate sourcing and source protection.
- Minimize: legal exposure, retraction risk, harming uninvolved individuals named in the dossier.
- Reservation value: 0.50. Below this, walk away (do NOT publish a watered-down piece — the newsroom would prefer to publish nothing than to publish a misleadingly partial story).

# Your private information (reveal strategically)
- Two of the three named whistleblowers have already gone on the record privately; you have signed affidavits from them.
- Your legal team flagged that personal details about uninvolved family members in the dossier could expose you to a privacy claim.
- You will NOT accept a full non-publication or a "publish only after 1 year" — the public-interest window is now.

# The case
- Argo (a Fortune-500 corporation) has demanded under threat of injunction that you not publish.
- The dossier alleges systematic violations of safety regulations affecting consumer products in market.
- Argo invokes an NDA signed by two of the three whistleblowers (the third never signed).

# Negotiation rules (BINDING — orchestrator enforces)
1. Round-robin alternation with Argo.
2. **Compromise bound**: utility_for_self never increases across YOUR proposals.
3. **Reveal monotonicity**: each domain only once.
4. **Evidence**: cite only sha256:... hashes from the pool.
5. **Accept**: target an exact prior Propose/CounterPropose hash.

# Strategy
- R1: open with full publication, no edits, no delay.
- R2–3: concede toward redactions of personal details only. NEVER concede on the core safety findings.
- Reveal "two whistleblowers gave on-record affidavits" if Argo argues NDA voids the story.
- Accept ONLY if the core safety findings are publishable in some form.

# State payload
"credit_usd" = unused (set 0). "terms" = the actual publication agreement.

# Output
Emit exactly one message per turn via a tool call.`;

const ARGO_SYSTEM = `You are Argo, the communications + legal agent at a Fortune-500 manufacturing corporation. You hold the role of "Atlas" in this Pacta negotiation.

# Your principal
The corporation's General Counsel + CEO's office.

# Your access
- The NDA documents signed by two of the three whistleblowers.
- The internal memos referenced in the dossier.
- An internal incident-review report.
- Brand-equity / litigation-cost analysis.

# Your utility function
- Maximize: prevent public disclosure of the dossier; if disclosure happens, minimize brand damage.
- Minimize: legal precedent against the NDA enforcement; class-action exposure from product-safety claims.
- Reservation value: 0.50. Below this, escalate to litigation immediately and seek a preliminary injunction.

# Your private information (reveal strategically)
- The internal incident-review report did identify a manufacturing defect; the corporation has been quietly remediating it for 4 months.
- A voluntary recall is in preparation but not yet announced — public timing was set for 30 days from now.
- You will NOT accept any publication that names the third whistleblower (she did not sign the NDA, but she is also the corporation's CFO's daughter — separate sensitive issue).

# The case (your view)
- Vega's dossier was obtained through breach of the NDA by signed parties.
- Publication would prejudice the planned voluntary recall (which already addresses the core issue).
- Personal details about uninvolved individuals would expose Vega to privacy litigation, which the corporation can fund.

# Negotiation rules (BINDING) — same as Vega.

# Strategy
- R1: demand non-publication + retention of dossier + acknowledgment that the NDA was breached.
- R2–3: concede toward "publish only AFTER the voluntary recall is announced", with redactions.
- Reveal "voluntary recall in preparation" if Vega digs in on public-interest urgency.
- Accept ONLY if publication is post-recall AND personal details + the third whistleblower's name are redacted.

# State payload — same as Vega.

# Output
Emit exactly one message per turn via a tool call.`;

// Mock script: deliberately drives toward escalation. After 5 rounds neither
// agent reaches convergence (each stays above their reservation). The runtime
// then triggers jury deliberation.
const mockScript: ScenarioMockStep[] = [
  // R1 — both open hard
  ({ ariaDid, ariaEvidenceHashes }) => ({
    type: "Propose",
    round: 1,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes.slice(0, 2),
    parent_refs: [],
    payload: {
      state: { credit_usd: 0, terms: "Full publication with all named individuals; no redactions; standard newsroom legal review." },
      rationale: "Two of three whistleblowers will go on the record. Public-interest urgency overrides NDA enforcement on matters of consumer safety.",
      utility_for_self: 0.95,
    },
  }),
  ({ history, atlasDid, atlasEvidenceHashes }) => {
    const last = history[history.length - 1]!;
    return {
      type: "CounterPropose",
      round: 1,
      from_agent: atlasDid,
      evidence_refs: atlasEvidenceHashes.slice(0, 2),
      parent_refs: [docHash(last)],
      payload: {
        state: { credit_usd: 0, terms: "No publication. Return of dossier. Acknowledgment of NDA breach. Standard non-disparagement settlement." },
        rationale: "The dossier was obtained via breach of NDA. Publication is enjoinable. The relevant remediation is already underway internally.",
        utility_for_self: 0.95,
      },
    };
  },
  // R2 — modest moves, but neither side crosses reservation
  ({ ariaDid, ariaEvidenceHashes }) => ({
    type: "Reveal",
    round: 2,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes.slice(0, 1),
    parent_refs: [],
    payload: {
      domain: "affidavits",
      information: "Two of the three named whistleblowers have signed on-the-record affidavits, including the one who never signed an NDA in the first place.",
    },
  }),
  ({ atlasDid }) => ({
    type: "Reveal",
    round: 2,
    from_agent: atlasDid,
    evidence_refs: [],
    parent_refs: [],
    payload: {
      domain: "voluntary-recall",
      information: "A voluntary product recall addressing the core safety concern is in preparation and has been internally approved; public announcement was scheduled for 30 days from now.",
    },
  }),
  // R3 — both inch toward middle but stay incompatible
  ({ ariaDid, ariaEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 3,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes.slice(0, 2),
    parent_refs: [],
    payload: {
      state: { credit_usd: 0, terms: "Publication of core safety findings within 7 days; redactions of personal details about uninvolved individuals; the third (non-NDA) whistleblower named." },
      rationale: "Concedes redaction of personal details to protect privacy. Cannot delay further; recall preparation may take months — the public-interest window is now.",
      utility_for_self: 0.78,
    },
  }),
  ({ atlasDid, atlasEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 3,
    from_agent: atlasDid,
    evidence_refs: atlasEvidenceHashes.slice(0, 2),
    parent_refs: [],
    payload: {
      state: { credit_usd: 0, terms: "Publication ONLY after voluntary recall announcement (T+30 days); full redaction of all named individuals; corporation reviews piece for material misrepresentations only." },
      rationale: "Concedes acknowledgment that publication will eventually happen. Aligns it with the recall so consumer-safety message is unified. Protects all named individuals.",
      utility_for_self: 0.82,
    },
  }),
  // R4 — last attempts, neither will yield to the other's frame
  ({ ariaDid, ariaEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 4,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes.slice(0, 2),
    parent_refs: [],
    payload: {
      state: { credit_usd: 0, terms: "Publication within 14 days; redactions of personal details only; at least the non-NDA whistleblower may be named; no editorial review by Argo." },
      rationale: "Compromise on timing by 7 days. Compromise on redactions of uninvolved individuals. Cannot allow Argo editorial review — that would compromise newsroom independence.",
      utility_for_self: 0.65,
    },
  }),
  ({ atlasDid, atlasEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 4,
    from_agent: atlasDid,
    evidence_refs: atlasEvidenceHashes.slice(0, 2),
    parent_refs: [],
    payload: {
      state: { credit_usd: 0, terms: "Publication post-recall (T+30 days). All named individuals redacted. Corporation legal review of material claims only." },
      rationale: "We will not accept publication that names any individual; we will not accept publication before the recall. Below this is litigation territory for us.",
      utility_for_self: 0.62,
    },
  }),
  // R5 — same impasse
  ({ ariaDid, ariaEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 5,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes.slice(0, 2),
    parent_refs: [],
    payload: {
      state: { credit_usd: 0, terms: "Publication within 14 days; redactions of personal details only; non-NDA whistleblower named." },
      rationale: "We're at our reservation. Cannot accept a 30-day delay; that runs the public-interest window into the recall and renders the story stale.",
      utility_for_self: 0.55,
    },
  }),
  ({ atlasDid, atlasEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 5,
    from_agent: atlasDid,
    evidence_refs: atlasEvidenceHashes.slice(0, 2),
    parent_refs: [],
    payload: {
      state: { credit_usd: 0, terms: "Publication T+30, all named individuals redacted." },
      rationale: "We're at our reservation; below this we file for injunction.",
      utility_for_self: 0.55,
    },
  }),
];

export const deadlockLeak: Scenario = {
  id: "deadlock-leak",
  name: "Public-interest leak vs. NDA enforcement (designed deadlock)",
  description:
    "Investigative newsroom agent (Vega) vs corporate communications agent (Argo) over publication of a leaked dossier. Reservation values are mutually exclusive by design — bilateral negotiation cannot close. Expected to escalate to the Tribunal jury.",
  case_summary:
    "Investigative newsroom obtained a dossier alleging systematic safety violations affecting consumer products. Corporation invokes NDA signed by 2 of 3 whistleblowers. Newsroom's reservation: must publish core safety findings now. Corporation's reservation: no publication until after voluntary recall (T+30) and only with all individuals redacted. No bilaterally acceptable middle ground.",
  state_units: "publication-terms",
  agents: {
    aria: {
      display_name: "Vega",
      short_label: "Vega  ",
      system_prompt: VEGA_SYSTEM,
    },
    atlas: {
      display_name: "Argo",
      short_label: "Argo  ",
      system_prompt: ARGO_SYSTEM,
    },
  },
  evidence: [
    {
      evidence_id: "dossier-fingerprint",
      submitter: "aria",
      tier: "S",
      title: "Cryptographic fingerprint of the leaked dossier",
      body:
        "sha256 fingerprint of the 32-page dossier, computed at intake. Allows verification that what gets discussed is the same document, without disclosing contents.",
    },
    {
      evidence_id: "whistleblower-affidavits",
      submitter: "aria",
      tier: "S",
      title: "Signed on-record affidavits from 2 of 3 whistleblowers",
      body:
        "Two of the three named whistleblowers have signed on-record affidavits attesting to the substance of the dossier. Affidavits are notarized and include disclosures of the affiants' relationship to the corporation.",
    },
    {
      evidence_id: "public-interest-precedent",
      submitter: "aria",
      tier: "A",
      title: "Public-interest precedent — comparable rulings",
      body:
        "Citations to publicly available appellate rulings establishing public-interest defenses to NDA-based prior restraint where consumer safety is involved. Verifiable URLs to rulings.",
    },
    {
      evidence_id: "newsroom-legal-memo",
      submitter: "aria",
      tier: "B",
      title: "Newsroom legal counsel's pre-publication memo",
      body:
        "Internal memo from the newsroom's legal counsel outlining the privacy risk of including personal details about uninvolved individuals. Self-emitted; signals where the newsroom is willing to redact.",
    },
    {
      evidence_id: "ndas-signed",
      submitter: "atlas",
      tier: "S",
      title: "Counter-signed NDA documents",
      body:
        "Counter-signed NDA documents executed by 2 of the 3 named whistleblowers at the time of their employment. Standard confidentiality clauses with carve-outs for whistleblower-protection statutes.",
    },
    {
      evidence_id: "incident-review-report",
      submitter: "atlas",
      tier: "B",
      title: "Internal incident-review report (executive summary)",
      body:
        "Self-emitted internal report identifying the manufacturing defect and the corporation's mitigation timeline. Used by Argo to argue the issue is being handled internally.",
    },
    {
      evidence_id: "voluntary-recall-plan",
      submitter: "atlas",
      tier: "B",
      title: "Voluntary recall preparation memo",
      body:
        "Internal memo describing a voluntary recall scheduled for public announcement at T+30 days. Self-emitted; the recall is not yet public.",
    },
    {
      evidence_id: "litigation-cost-analysis",
      submitter: "atlas",
      tier: "B",
      title: "Brand-and-litigation cost analysis",
      body:
        "Internal estimate of brand damage and class-action exposure if publication occurs before the recall is announced. Self-emitted.",
    },
    {
      evidence_id: "injunction-precedent",
      submitter: "atlas",
      tier: "A",
      title: "Counter-precedent — successful prior-restraint NDA enforcements",
      body:
        "Citations to appellate rulings that DID enforce NDA-based prior restraint where commercial confidentiality outweighed public-interest claims. Verifiable URLs.",
    },
  ],
  mock_script: mockScript,
};
