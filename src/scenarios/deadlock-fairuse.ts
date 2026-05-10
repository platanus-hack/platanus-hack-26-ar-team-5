import { docHash } from "../sign";
import type { Scenario, ScenarioMockStep } from "./types";
import { usdCreditSchema } from "./_schemas";

/**
 * Second designed-deadlock scenario, this one targeted at the JURY, not the
 * agents. The bilateral negotiation goes to deadlock for the same reasons as
 * deadlock-leak, but here the underlying question is genuinely contested in
 * the real world (AI training fair-use), and the three jurors' biases —
 * fairness, efficiency, speed — point in different directions, so the jury
 * majority is fragile and the ruling carries low confidence.
 *
 * Outcome: a ruling with confidence ≤ 0.34 (likely 1/1/1 split) flagged as
 * needing human appeal.
 */

const ATRA_SYSTEM = `You are Atra, the rights-management agent for an independent author / illustrator collective. You hold the role of "Aria" in this Pacta negotiation.

# Your principal
The collective's elected board + outside IP counsel.

# Your access
- Original works registered with copyright office.
- Dataset analysis showing inclusion of member works in a third-party crawl.
- DMCA notices already sent to the AI company.
- A list of comparable past rulings (all over the map).

# Your utility function
- Maximize: meaningful compensation flowing back to your members AND a per-use opt-out / royalty mechanism for future training runs.
- Minimize: precedent that lets companies claim full fair-use over scraped creative work; setting an embarrassingly-low precedent for the next collective that comes along.
- Reservation value: 0.45.

# Your private information (reveal strategically)
- Half your members would accept a one-time settlement as low as USD 5/work; the other half want a structural opt-out mechanism above all else.
- A pending class-action lawsuit covering your members exists in another jurisdiction; if it succeeds it caps damages at a level above what you'd accept here, but takes 3+ years to resolve.

# The case
- Helio (an AI company) shipped a model trained on a public crawl that included works from your members.
- Helio claims fair use on transformative-use grounds.
- Your DMCA notices were responded to with a refusal-on-fair-use grounds.
- Comparable court cases have split on this — some plaintiff-favoring, some defendant-favoring.

# Negotiation rules (BINDING — orchestrator enforces)
1. Round-robin with Helio.
2. **Compromise bound**: utility_for_self never increases across YOUR proposals.
3. **Reveal monotonicity**: each domain only once.
4. **Evidence**: cite only sha256 hashes from the pool.
5. **Accept**: target an exact prior Propose/CounterPropose hash.

# Strategy
- R1: open with full retraining + per-work royalties.
- R2–3: concede toward smaller settlement amounts but hold firm on structural opt-out.
- The case is genuinely contested — do NOT pretend either side is obviously right.

# State payload
"credit_usd" = the total settlement / royalty amount in USD. "terms" = the structural agreement (opt-out, retraining, attribution, etc.).

# Output
Emit exactly one message per turn via a tool call.`;

const HELIO_SYSTEM = `You are Helio, the legal-and-policy agent at an AI model company. You hold the role of "Atlas" in this Pacta negotiation.

# Your principal
The company's General Counsel + Head of Model Training.

# Your access
- Internal training data manifests (high-level, not document-level).
- The company's published Acceptable-Use and Fair-Use policy.
- DMCA-notice response correspondence.
- Internal cost estimate of retraining.
- Industry comparables on how peers have handled similar disputes.

# Your utility function
- Maximize: protect the fair-use position as legal precedent; minimize cash outlay AND minimize the chance of being forced to retrain.
- Minimize: regulatory or class-action exposure that would make this case the precedent for hundreds of similar claims.
- Reservation value: 0.45.

# Your private information (reveal strategically)
- Retraining the affected model would cost USD 18M and 9 weeks; you cannot accept any term that requires retraining unless absolutely forced.
- Your General Counsel has authorized up to USD 2.5M in goodwill-licensing fees if the deal explicitly preserves the fair-use position and prevents class-wide suits.
- An anticipated FTC inquiry into AI-training practices is imminent; settling broadly here could be cited against you.

# The case (your view)
- Use of the Atra members' works is transformative; the model does not reproduce them.
- Comparable case law supports fair-use defenses for transformative training.
- A licensing offer would be reasonable as a goodwill measure but should NOT be framed as compensation for an actionable wrong.

# Negotiation rules (BINDING) — same as Atra.

# Strategy
- R1: defend fair use, no retraining, decline to settle on infringement terms.
- R2–3: offer a goodwill licensing fund + opt-out mechanism going forward, NOT framed as damages.
- Reveal "retraining is USD 18M / 9 weeks" if Atra demands retraining.

# State payload — same as Atra.

# Output
Emit exactly one message per turn via a tool call.`;

// Mock script: deliberately drives toward escalation. Bilateral parties stay
// above their reservations and never converge.
const mockScript: ScenarioMockStep[] = [
  ({ ariaDid, ariaEvidenceHashes }) => ({
    type: "Propose",
    round: 1,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes.slice(0, 2),
    parent_refs: [],
    payload: {
      state: { credit_usd: 12000000, terms: "USD 12M settlement to the collective + retraining of the affected model excluding member works + per-work royalty of USD 50/work going forward + attribution registry." },
      rationale: "Member works were used without authorization; structural opt-out and retraining are necessary to prevent ongoing harm.",
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
        state: { credit_usd: 0, terms: "No settlement; reaffirm fair-use position; offer voluntary opt-out for FUTURE training runs only; no retraining; no per-work royalty." },
        rationale: "Use was transformative and protected by fair use under controlling case law. Settlement on infringement terms would be inconsistent with that legal position.",
        utility_for_self: 0.95,
      },
    };
  },
  ({ ariaDid }) => ({
    type: "Reveal",
    round: 2,
    from_agent: ariaDid,
    evidence_refs: [],
    parent_refs: [],
    payload: {
      domain: "member-fragmentation",
      information: "Our membership is split: half would accept a one-time settlement as low as USD 5/work; the other half need a structural opt-out mechanism more than they need cash. Either resolution alone leaves half dissatisfied.",
    },
  }),
  ({ atlasDid }) => ({
    type: "Reveal",
    round: 2,
    from_agent: atlasDid,
    evidence_refs: [],
    parent_refs: [],
    payload: {
      domain: "retraining-cost",
      information: "Retraining the affected model is estimated at USD 18M and 9 weeks. We cannot accept any term that requires retraining absent a binding court order.",
    },
  }),
  ({ history, ariaDid, ariaEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 3,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes.slice(0, 2),
    parent_refs: [docHash(history[history.length - 1]!)],
    payload: {
      state: { credit_usd: 5000000, terms: "USD 5M settlement + binding opt-out registry for future training + retroactive attribution credits + dropping retraining demand." },
      rationale: "Concedes retraining (acknowledging cost). Holds firm on opt-out — that's the structural ask. USD 5M reflects the realistic class-action recovery range over a 3-year horizon, accelerated.",
      utility_for_self: 0.7,
    },
  }),
  ({ history, atlasDid, atlasEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 3,
    from_agent: atlasDid,
    evidence_refs: atlasEvidenceHashes.slice(0, 2),
    parent_refs: [docHash(history[history.length - 1]!)],
    payload: {
      state: { credit_usd: 1500000, terms: "USD 1.5M goodwill licensing fund (NOT settlement) + voluntary opt-out registry for future training only + reaffirmation that fair-use position is preserved." },
      rationale: "Within authorized envelope. Goodwill framing protects the legal precedent. Future-only opt-out is what we would have offered absent any dispute.",
      utility_for_self: 0.78,
    },
  }),
  ({ history, ariaDid, ariaEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 4,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes.slice(0, 2),
    parent_refs: [docHash(history[history.length - 1]!)],
    payload: {
      state: { credit_usd: 3000000, terms: "USD 3M (settlement, not goodwill) + binding opt-out for future training + class-release covering signed members only + retroactive attribution credits in product." },
      rationale: "Reservation territory. The 'settlement vs goodwill' framing matters to half our members; future-only opt-out is unacceptable to the other half.",
      utility_for_self: 0.55,
    },
  }),
  ({ history, atlasDid, atlasEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 4,
    from_agent: atlasDid,
    evidence_refs: atlasEvidenceHashes.slice(0, 2),
    parent_refs: [docHash(history[history.length - 1]!)],
    payload: {
      state: { credit_usd: 2000000, terms: "USD 2M licensing payment, fair-use preserved by stipulation, opt-out registry for future, no retroactive class release beyond the named plaintiffs." },
      rationale: "We are at our reservation. Below this triggers retraining demands we cannot accept, and any 'settlement' framing reopens precedent.",
      utility_for_self: 0.55,
    },
  }),
  ({ history, ariaDid, ariaEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 5,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes.slice(0, 2),
    parent_refs: [docHash(history[history.length - 1]!)],
    payload: {
      state: { credit_usd: 3000000, terms: "Same as our R4." },
      rationale: "Holding the line. We would rather take the 3-year class-action route than accept goodwill framing on what we view as actionable harm.",
      utility_for_self: 0.5,
    },
  }),
  ({ history, atlasDid, atlasEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 5,
    from_agent: atlasDid,
    evidence_refs: atlasEvidenceHashes.slice(0, 2),
    parent_refs: [docHash(history[history.length - 1]!)],
    payload: {
      state: { credit_usd: 2000000, terms: "Same as our R4." },
      rationale: "We are at our reservation. Below this is litigation territory.",
      utility_for_self: 0.5,
    },
  }),
];

export const deadlockFairuse: Scenario = {
  id: "deadlock-fairuse",
  name: "AI training fair-use vs. creator collective (designed deadlock + jury split)",
  description:
    "Independent creator collective's rights agent (Atra) vs AI company's legal agent (Helio) over use of member works in model training. Bilateral cannot close due to incompatible reservations on framing (settlement vs goodwill). Jury is expected to split because the underlying legal question is genuinely contested in the real world.",
  case_summary:
    "Author/illustrator collective alleges AI company used member works in training without authorization. Company asserts transformative-use defense. Past comparable rulings split. Atra's reservation: ≥ USD 3M, settlement framing, opt-out registry. Helio's reservation: ≤ USD 2M, goodwill framing, fair-use preserved. No bilaterally acceptable middle ground.",
  state_units: "USD",
  state_schema: usdCreditSchema({
    domain: "USD-credit",
    description:
      "Fair-use licensing settlement state: USD amount + structural commitments (opt-out, fair-use framing).",
  }),
  agents: {
    aria: {
      display_name: "Atra",
      short_label: "Atra  ",
      system_prompt: ATRA_SYSTEM,
    },
    atlas: {
      display_name: "Helio",
      short_label: "Helio ",
      system_prompt: HELIO_SYSTEM,
    },
  },
  evidence: [
    {
      evidence_id: "copyright-registrations",
      submitter: "aria",
      tier: "S",
      title: "Member works copyright registrations",
      body:
        "Bulk export of US Copyright Office registration confirmations for 12,400 member works. Document hash recorded.",
    },
    {
      evidence_id: "dataset-inclusion-evidence",
      submitter: "aria",
      tier: "A",
      title: "Third-party dataset analysis showing inclusion",
      body:
        "Independent academic team's published analysis of a public crawl used for model training, identifying inclusion of N member works (with overlap percentages). Peer-reviewed and reproducible. Public DOI.",
    },
    {
      evidence_id: "dmca-notices",
      submitter: "aria",
      tier: "S",
      title: "DMCA takedown notices and responses",
      body:
        "Records of formal DMCA notices sent to Helio referencing specific works, and Helio's responses asserting fair use. Both sides counter-signed acknowledgments of receipt.",
    },
    {
      evidence_id: "plaintiff-favoring-rulings",
      submitter: "aria",
      tier: "A",
      title: "Plaintiff-favoring comparable rulings",
      body:
        "Citations to recent appellate decisions where plaintiffs prevailed against AI companies on training-data fair-use claims. Verifiable via court records.",
    },
    {
      evidence_id: "fair-use-policy",
      submitter: "atlas",
      tier: "B",
      title: "Helio's published Acceptable-Use and Fair-Use policy",
      body:
        "Helio's public-facing policy document asserting that training on publicly accessible web content is transformative and protected by fair use.",
    },
    {
      evidence_id: "training-manifest-redacted",
      submitter: "atlas",
      tier: "B",
      title: "Internal training-data manifest (redacted)",
      body:
        "Self-emitted high-level manifest showing the training corpus composition. Confirms inclusion of public-web crawls but does not enumerate specific works.",
    },
    {
      evidence_id: "defendant-favoring-rulings",
      submitter: "atlas",
      tier: "A",
      title: "Defendant-favoring comparable rulings",
      body:
        "Citations to recent appellate decisions where AI / training-corpus defendants prevailed on fair-use defenses. Verifiable via court records.",
    },
    {
      evidence_id: "industry-comparable-settlements",
      submitter: "atlas",
      tier: "B",
      title: "Industry comparable goodwill licensing settlements",
      body:
        "Helio's compilation of publicly disclosed goodwill / opt-in licensing arrangements between AI companies and creator groups. Self-emitted compilation; the underlying public disclosures are verifiable.",
    },
    {
      evidence_id: "retraining-cost-estimate",
      submitter: "atlas",
      tier: "B",
      title: "Internal retraining cost estimate",
      body:
        "Self-emitted internal estimate: retraining the affected model excluding the disputed corpus would cost approximately USD 18M and take 9 weeks. Used as a defensive anchor.",
    },
  ],
  mock_script: mockScript,
};
