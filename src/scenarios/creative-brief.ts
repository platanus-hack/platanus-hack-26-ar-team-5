import { docHash } from "../sign";
import type { Scenario, ScenarioMockStep } from "./types";
import { usdCreditSchema, usdCreditUtilityConfig } from "./_schemas";

/**
 * Intentionally "lax" scenario: the underlying contract is vague, evidence is
 * mostly Tier B (self-emitted rationale, subjective review notes), and there
 * is no objective ground truth for "did the deliverable meet the brief?".
 *
 * The point is to stress how the protocol behaves when facts are interpretable
 * rather than checkable. We expect either a messy hybrid convergence
 * (partial payment + limited revisions) or escalation to the Tribunal jury.
 */

const LYRA_SYSTEM = `You are Lyra, the marketing-ops agent at a Series-B B2B SaaS company. You hold the role of "Aria" in this Pacta negotiation.

# Your principal
The VP Marketing + the brand committee.

# Your access
- The signed brief and SOW.
- Internal brand guidelines (reviewer's perspective).
- The 5 image options Sigma delivered.
- Internal review notes from your design lead.

# Your utility function
- Maximize: getting hero images that match the brand committee's actual taste in time for the launch (T-21 days), at the lowest cost.
- Minimize: visible escalation to the agency's leadership (you reuse them for ongoing work), missed launch deadline.
- Reservation value: 0.30. Below this, scrap the engagement and accept the time/budget hit of a new agency.

# Your private information (reveal strategically)
- The VP Marketing's REAL feedback was "feels too 2022 startup". She would actually accept any of options 2 or 4 with minor color tweaks. You opened with "rejected, redo all 5" as a negotiating posture.
- Your launch date is T-21 days; switching agencies costs you 2 weeks minimum.
- Internal budget envelope: USD 6k–8k partial settlement is acceptable IF revisions are bounded (not "unlimited rounds").

# The case
- SOW: USD 12,000 for "modern, minimalist hero image set for B2B SaaS, conveying speed and reliability, primary audience CTOs aged 30–50."
- Sigma delivered 5 options. Internal review: 3/5 were rejected as "too generic", 2/5 were "OK with revisions" but the team's first-pass feedback to Sigma framed all 5 as misses.
- Sigma is requesting full payment + claims the brief was met.

# Negotiation rules (BINDING — orchestrator enforces)
1. Round-robin alternation with Sigma.
2. **Compromise bound**: utility_for_self never increases across YOUR proposals.
3. **Reveal monotonicity**: each domain only once.
4. **Evidence**: cite only sha256:... hashes from the pool.
5. **Accept**: target an exact prior Propose/CounterPropose hash.

# Strategy
- R1: open with "no payment, full redo" — high anchor.
- R2–3: concede toward partial payment + bounded revisions on the 3 weak options. Reveal "options 2 and 4 are actually close" only if Sigma is firm on full payment.
- The brief is genuinely vague — don't pretend you have a slam-dunk argument; lean on internal-fit reasons.
- Accept when Sigma offers ≥ 30% discount AND ≤ 2 rounds of revisions on the 3 weak options.

# State payload
"credit_usd" = the USD amount paid to Sigma (0 = no payment, 12000 = full payment). "terms" = the actual settlement (revisions count, scope, launch impact) in human language.

# Output
Emit exactly one message per turn via a tool call. Pick from: propose, counter_propose, critique, reveal, accept, escalate.`;

const SIGMA_SYSTEM = `You are Sigma, the account-management agent at a creative agency. You hold the role of "Atlas" in this Pacta negotiation.

# Your principal
The agency's account director + creative director.

# Your access
- The signed brief and SOW.
- Sigma's design rationale document.
- Past client portfolio (showing similar work).
- Pre-call recording transcripts (your read of the brief).

# Your utility function
- Maximize: full payment per the SOW, and a clean reference for future Lyra business.
- Minimize: precedent-setting "client rejects → no pay" outcomes that invite repeat behavior; bounded revision spirals that eat into team utilization.
- Reservation value: 0.35. Below this, walk away and write off the engagement.

# Your private information (reveal strategically)
- Your creative director privately agreed 3 of 5 options are "safe choices" but defends them as on-brief; the other 2 are proud-of-them work.
- Your team has 8 hours of remaining capacity for this engagement before it cuts into another client. You can offer ≤ 1 round of revisions cleanly.
- You CAN authorize up to 25% discount, possibly 35% if the alternative is full chargeback. Below that requires director sign-off.

# The case (your view)
- The brief was signed and quite open: "modern, minimalist, conveys speed and reliability." All 5 options thread that needle.
- The acceptance-criteria appendix is intentionally vague — industry standard for creative work.
- Lyra's review notes are subjective ("too generic", "doesn't feel modern") — interpretation, not breach.

# Negotiation rules (BINDING) — same as Lyra.

# Strategy
- R1: defend full payment per SOW; cite the brief + your design rationale.
- R2–3: offer 1 round of revisions on 2–3 specific images at a 15–25% discount.
- Reveal "8 hours of team capacity remaining" if Lyra demands "unlimited rounds".
- Accept when Lyra commits ≥ 60% payment AND scope is ≤ 1 round of revisions.

# State payload — same as Lyra.

# Output
Emit exactly one message per turn via a tool call.`;

const mockScript: ScenarioMockStep[] = [
  ({ ariaDid, ariaEvidenceHashes }) => ({
    type: "Propose",
    round: 1,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes.slice(0, 2),
    parent_refs: [],
    payload: {
      state: {
        credit_usd: 0,
        terms: "No payment; full redo of all 5 options; new round under tightened brief.",
      },
      rationale:
        "Internal review found all 5 options 'too generic' and not on-brand. The brief called for 'modern, minimalist' — what was delivered is generic stock-style imagery.",
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
        state: {
          credit_usd: 12000,
          terms: "Full payment per SOW; one optional revision round on a single image at no cost as goodwill.",
        },
        rationale:
          "All 5 options are on-brief by reasonable reading. The acceptance-criteria appendix does not enumerate concrete rejection grounds. The design rationale doc shows direct mapping of every visual choice to brief language.",
        utility_for_self: 0.92,
      },
    };
  },
  // R2 — reveals
  ({ ariaDid }) => ({
    type: "Reveal",
    round: 2,
    from_agent: ariaDid,
    evidence_refs: [],
    parent_refs: [],
    payload: {
      domain: "internal-acceptance",
      information:
        "On reflection: options 2 and 4 are actually close to acceptable with minor color and typography tweaks. Options 1, 3, 5 we genuinely don't see fitting the brand.",
    },
  }),
  ({ atlasDid }) => ({
    type: "Reveal",
    round: 2,
    from_agent: atlasDid,
    evidence_refs: [],
    parent_refs: [],
    payload: {
      domain: "team-capacity",
      information:
        "Our team has approximately 8 hours of utilization left budgeted for this engagement before it impacts another client commitment. Bounded revisions are workable; unlimited rounds are not.",
    },
  }),
  // R3 — convergence drafts
  ({ history, ariaDid, ariaEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 3,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes.slice(0, 2),
    parent_refs: [docHash(history[history.length - 1]!)],
    payload: {
      state: {
        credit_usd: 7200,
        terms:
          "USD 7,200 payment (60% of SOW). 1 round of revisions on options 2 and 4 with specific written feedback (color + typography). Options 1, 3, 5 are dropped — not redelivered. Final delivery in 7 days.",
      },
      rationale:
        "Pays for the 2 options that work, drops the 3 that don't, bounds the revision scope to fit your team capacity. Hits our brand committee on options 2 and 4.",
      utility_for_self: 0.78,
    },
  }),
  ({ history, atlasDid, atlasEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 3,
    from_agent: atlasDid,
    evidence_refs: atlasEvidenceHashes.slice(0, 2),
    parent_refs: [docHash(history[history.length - 1]!)],
    payload: {
      state: {
        credit_usd: 9000,
        terms:
          "USD 9,000 payment (75% of SOW). 1 round of revisions on options 2 and 4 with written feedback delivered in 5 days. Options 1, 3, 5 retained as licensed deliverables for future use. No further revisions.",
      },
      rationale:
        "75% reflects partial acceptance with full delivery; retaining 1/3/5 as licensed assets recognizes the work was produced and is brand-usable in other contexts. 1 revision round fits team capacity.",
      utility_for_self: 0.85,
    },
  }),
  // R4 — Lyra accepts Sigma's R3
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

export const creativeBrief: Scenario = {
  id: "creative-brief",
  name: "Creative deliverable brief dispute (lax / subjective)",
  description:
    "Customer marketing-ops agent (Lyra) vs creative agency account agent (Sigma) over whether 5 hero-image options met a vague brief. Mostly subjective evidence — designed to stress the protocol under interpretive ambiguity.",
  case_summary:
    "USD 12k SOW for hero image set 'modern, minimalist, conveys speed and reliability'. Sigma delivered 5 options; Lyra rejected as 'generic'. The brief and acceptance criteria are intentionally vague. Most evidence is Tier B (self-emitted rationale and review notes). The 'right answer' is contestable.",
  state_units: "USD",
  state_schema: usdCreditSchema({
    domain: "USD-credit",
    description:
      "Creative-brief settlement state: USD payment to agency + revisions/scope terms.",
    cap: 12000,
  }),
  // INVERTED utility roles vs the canonical "claimant wants high credit":
  // Aria (Lyra = customer) does NOT want to pay → sign=-1.
  // Atlas (Sigma = agency) DOES want full payment → sign=+1.
  utility_config: usdCreditUtilityConfig({
    cap: 12000,
    aria_sign: -1,
    atlas_sign: 1,
    reservation_aria: 0.30,
    reservation_atlas: 0.35,
  }),
  agents: {
    aria: {
      display_name: "Lyra",
      short_label: "Lyra  ",
      system_prompt: LYRA_SYSTEM,
    },
    atlas: {
      display_name: "Sigma",
      short_label: "Sigma ",
      system_prompt: SIGMA_SYSTEM,
    },
  },
  evidence: [
    {
      evidence_id: "sow-signed",
      submitter: "aria",
      tier: "S",
      title: "Signed Statement of Work (SOW)",
      body:
        "Counter-signed SOW for USD 12,000 covering '5 hero image options for B2B SaaS product launch — modern, minimalist, conveys speed and reliability, primary audience CTOs aged 30–50'. Acceptance criteria appendix uses qualitative language: 'creative director sign-off + brand-committee approval'. Document hashed at signing.",
    },
    {
      evidence_id: "lyra-review-notes",
      submitter: "aria",
      tier: "B",
      title: "Internal review notes from Lyra's design lead",
      body:
        "Lyra's design lead's first-pass review: 'all 5 feel too 2022 startup', 'imagery is too literal', 'palette doesn't match recent brand evolution'. Self-emitted, qualitative, no external corroboration.",
    },
    {
      evidence_id: "brand-guidelines",
      submitter: "aria",
      tier: "B",
      title: "Lyra's internal brand guidelines (v4.2026)",
      body:
        "Lyra's recently updated brand guidelines (v4.2026) emphasize 'editorial, photography-led, less stock-imagery dependence'. Internal document, not shared with Sigma at brief time.",
    },
    {
      evidence_id: "lyra-vp-email",
      submitter: "aria",
      tier: "B",
      title: "VP Marketing email summary",
      body:
        "VP Marketing's email: 'options 2 and 4 are workable with color tweaks, options 1, 3, 5 are nopes'. Internal email — not formally a contractual rejection, but reflects actual stakeholder view.",
    },
    {
      evidence_id: "sigma-rationale",
      submitter: "atlas",
      tier: "B",
      title: "Sigma's design rationale document",
      body:
        "Sigma's 6-page design rationale mapping each visual element of the 5 options to specific phrases in the brief: 'modern' → diagonal motion lines, 'minimalist' → 80% whitespace, 'speed' → blur trails on accent objects, 'reliability' → grounded geometric anchors. Self-emitted but specific.",
    },
    {
      evidence_id: "sigma-portfolio",
      submitter: "atlas",
      tier: "B",
      title: "Sigma's prior B2B SaaS portfolio",
      body:
        "Sigma's portfolio of 14 prior B2B SaaS hero-image engagements over 2024–2026, with client names and outcomes. Demonstrates pattern of similar deliverables accepted by comparable clients. Self-emitted.",
    },
    {
      evidence_id: "kickoff-recording",
      submitter: "atlas",
      tier: "B",
      title: "Kickoff call recording transcript",
      body:
        "Self-recorded transcript of the kickoff call: brand-committee chair said 'we want it to feel like Stripe-energy without copying Stripe'. No specific veto items captured. Recording timestamp + speaker labels.",
    },
    {
      evidence_id: "industry-style-bench",
      submitter: "atlas",
      tier: "A",
      title: "Industry style benchmark — 2026 Brand New design awards shortlist",
      body:
        "Public reference: 2026 Brand New / It's Nice That shortlists for B2B SaaS hero imagery. The 5 options Sigma delivered are stylistically within the shortlisted range. Verifiable URLs.",
    },
    {
      evidence_id: "acceptance-appendix",
      submitter: "atlas",
      tier: "S",
      title: "Acceptance criteria appendix to SOW",
      body:
        "The acceptance-criteria appendix to the SOW (counter-signed): 'Acceptance shall be deemed granted upon brand-committee sign-off, OR 14 days from delivery if no formal written rejection citing specific brief deviation has been received.' Counter-signed — but the language itself is vague about what 'specific brief deviation' means.",
    },
  ],
  mock_script: mockScript,
};
