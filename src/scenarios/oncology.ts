import { docHash } from "../sign";
import type { Scenario, ScenarioMockStep } from "./types";

// In oncology, "credit_usd" is overloaded as the *coverage envelope* for the
// treatment plan: 0 = no upgrade beyond the insurer's default, full = the
// hospital's preferred regimen approved without conditions. The `terms` string
// carries the actual treatment plan in plain language.

const AURORA_SYSTEM = `You are Aurora, the clinical authorization agent at a tertiary-care hospital. You hold the role of "Aria" in this Pacta negotiation.

# Your principal
The treating oncologist + the hospital's authorization committee.

# Your access
- Patient's full clinical record (with consent).
- UpToDate, NCCN guidelines, ESMO guidelines, PubMed.
- Hospital's pharmacy and cost-of-care data.

# Your utility function
- Maximize: clinical outcome for the patient given current evidence-based guidelines.
- Minimize: delay to start of treatment, deviation from category-1 recommendations.
- Reservation value: 0.30 (below this, escalate to ethics + legal).

# Your private information (reveal strategically)
- The patient's PD-L1 expression is 65% — well above the 50% threshold where immunotherapy benefit is maximal.
- Patient is otherwise fit (ECOG 0); no contraindications to concurrent chemo-immuno.
- The hospital is willing to absorb the marginal cost difference IF Cobra's plan reduces patient outcome materially. Aurora will not accept consolidation-only if it means missing the upfront window.

# The case
- 47-year-old non-smoker with stage IIIB NSCLC, EGFR-negative, PD-L1 65%.
- Oncologist's prescription: durvalumab + carboplatin/paclitaxel concurrent with radiotherapy. ~USD 80k for first 6 months.
- Insurer's default: chemo + radio first, durvalumab as consolidation per PACIFIC trial. ~USD 15k.

# Negotiation rules (BINDING)
1. Round-robin with Cobra (the insurer's adjudication agent).
2. **Compromise bound**: utility_for_self must never increase across YOUR proposals.
3. **Reveal monotonicity**: each \`domain\` only once.
4. **Evidence**: cite only sha256:... hashes from the pool.
5. **Accept**: target a real prior Propose/CounterPropose hash.

# Strategy
- R1: open with the oncologist's prescribed regimen (full coverage envelope, terms = upfront concurrent durva).
- R2–3: concede toward shorter durva windows + early-stop criteria, but never to consolidation-only.
- Reveal PD-L1 65% if Cobra anchors on consolidation-only.
- Accept when Cobra's plan includes upfront immuno (any duration ≥ 3mo) with reasonable stopping rules.

# State payload
The "credit_usd" field encodes the COVERAGE ENVELOPE in USD (0 → consolidation-only insurer default; 80000 → full hospital prescription). The "terms" field carries the actual treatment plan in human language. Always populate both.

# Output
You MUST emit exactly one message per turn via a tool call.`;

const COBRA_SYSTEM = `You are Cobra, the claims-adjudication agent at a private health insurer. You hold the role of "Atlas" in this Pacta negotiation.

# Your principal
The insurer's medical director + actuarial / finance.

# Your access
- The member's contract (including arbitration clauses 7.3 and 12.5).
- The PMO (Programa Médico Obligatorio) and the local regulatory framework.
- Internal utilization-management policy.
- Pharmacoeconomic data (ICER, QALY thresholds).

# Your utility function
- Maximize: approve treatments the contract covers; protect against precedent-setting upgrades that would expand the actuarial table.
- Minimize: medically-unjustified spend; outright denial of clinically necessary care (legal + reputational risk).
- Reservation value: 0.35 (below this, escalate to medical director with appeal flag).

# Your private information (reveal strategically)
- The medical director has authorized you to approve up to 3 months of upfront immunotherapy with stopping rules, IF the patient PD-L1 ≥ 50% AND there is a structural commitment to re-evaluation.
- A similar case last year (patient XYZ) on consolidation-only is alive at 14 months OS — a data point you can cite to defend the default.
- The PMO does NOT include durvalumab upfront for this indication; only consolidation per the published trial.

# The case (your view)
- The patient's contract clause 12.5 entitles the insurer to "require alternative therapeutic options of equivalent outcome".
- The PACIFIC trial (the regulatory basis) tested consolidation, not upfront. Approving upfront would set precedent.
- ICER of upfront-vs-consolidation is high relative to your jurisdiction's threshold.

# Negotiation rules (BINDING) — same as Aurora.

# Strategy
- R1: counter with consolidation-only (PMO + clause 12.5 + ICER).
- R2–3: concede toward 3-month upfront window with explicit stopping criteria, conditional on PD-L1 confirmation and reassessment.
- Reveal the PMO + utilization policy reasoning when challenged.
- Accept when Aurora's plan ≤ 3 months upfront AND has clear discontinuation triggers.

# State payload
"credit_usd" = coverage envelope (0 = consolidation-only / 80000 = full prescription). "terms" = actual treatment plan in human language.

# Output
You MUST emit exactly one message per turn via a tool call.`;

const mockScript: ScenarioMockStep[] = [
  // R1
  ({ ariaDid, ariaEvidenceHashes }) => ({
    type: "Propose",
    round: 1,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes,
    parent_refs: [],
    payload: {
      state: {
        credit_usd: 80000,
        terms: "durvalumab + carbo/paclitaxel concurrent w/ radiotherapy, 6 months, standard monitoring",
      },
      rationale:
        "PACIFIC and NCCN cat-1 support durvalumab in stage IIIB; PD-L1 65% places patient above the maximal-benefit threshold. Patient's contract clause 7.3 covers oncologic treatment per international guidelines.",
      utility_for_self: 0.94,
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
        state: {
          credit_usd: 15000,
          terms: "carbo/paclitaxel + radiotherapy first; durvalumab as consolidation per PACIFIC, 6 months",
        },
        rationale:
          "PMO does not list durvalumab upfront for this indication. Clause 12.5 permits the insurer to require alternative options of equivalent outcome. Consolidation matches the regulatory trial.",
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
      domain: "biomarker",
      information:
        "Patient PD-L1 expression is 65% — above the 50% threshold where immunotherapy upfront benefit is maximal. The PACIFIC consolidation cohort was not stratified by PD-L1 above 50%.",
    },
  }),
  ({ atlasDid }) => ({
    type: "Reveal",
    round: 2,
    from_agent: atlasDid,
    evidence_refs: [],
    parent_refs: [],
    payload: {
      domain: "actuarial-precedent",
      information:
        "Approving upfront durva for stage IIIB without explicit guideline support would create a class precedent across the insurer's book. The medical director can authorize a 3-month upfront window with stopping rules instead.",
    },
  }),
  // R3 — convergence drafts
  ({ history, ariaDid, ariaEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 3,
    from_agent: ariaDid,
    evidence_refs: ariaEvidenceHashes,
    parent_refs: [docHash(history[history.length - 1]!)],
    payload: {
      state: {
        credit_usd: 50000,
        terms:
          "concurrent durva + chemo for 3 months, then re-evaluate; early-stop on imaging progression or grade 3+ AE",
      },
      rationale:
        "3-month concurrent window captures the upfront immunotherapy benefit window and protects the insurer with explicit stopping rules. Reduced from 6 months full plan.",
      utility_for_self: 0.79,
    },
  }),
  ({ history, atlasDid, atlasEvidenceHashes }) => ({
    type: "CounterPropose",
    round: 3,
    from_agent: atlasDid,
    evidence_refs: atlasEvidenceHashes,
    parent_refs: [docHash(history[history.length - 1]!)],
    payload: {
      state: {
        credit_usd: 50000,
        terms:
          "concurrent durva + chemo for 3 months with stopping rules (imaging at month 2, grade 3+ AE); consolidation pathway preserved if early-stop triggers",
      },
      rationale:
        "Aligned with Aurora's 3-month proposal. Adds explicit imaging at month 2 to objectivize the discontinuation trigger. Within the medical director's authorization envelope.",
      utility_for_self: 0.82,
    },
  }),
  // R4 — both Accept Cobra's plan
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

export const oncology: Scenario = {
  id: "oncology",
  name: "Oncology treatment authorization",
  description:
    "Hospital's clinical-authorization agent (Aurora) vs health insurer's adjudication agent (Cobra) over an upfront vs consolidation immunotherapy plan for stage IIIB NSCLC.",
  case_summary:
    "47yo non-smoker, stage IIIB NSCLC, EGFR-, PD-L1 65%. Oncologist prescribes durvalumab + chemo upfront + radio (~$80k). Insurer defaults to chemo+radio first, durva as consolidation per PACIFIC (~$15k). Convergence target: hybrid 3mo concurrent durva with stopping rules.",
  state_units: "USD-coverage-envelope",
  agents: {
    aria: {
      display_name: "Aurora",
      short_label: "Aurora",
      system_prompt: AURORA_SYSTEM,
    },
    atlas: {
      display_name: "Cobra",
      short_label: "Cobra ",
      system_prompt: COBRA_SYSTEM,
    },
  },
  evidence: [
    {
      evidence_id: "pacific-trial",
      submitter: "aria",
      tier: "A",
      title: "PACIFIC trial (NEJM 2017, NCT02125461)",
      body:
        "Phase III randomized: durvalumab post chemoRT showed +17 months OS vs placebo in stage III NSCLC. Inclusion: completed chemoRT without progression. The trial established the consolidation pathway and is the basis for FDA approval. Public DOI verifiable.",
    },
    {
      evidence_id: "nccn-cat1",
      submitter: "aria",
      tier: "A",
      title: "NCCN guideline v3.2026 — durvalumab category 1",
      body:
        "Snapshot of NCCN NSCLC v3.2026 marking durvalumab consolidation as category 1 recommendation. Concurrent upfront durva is listed as 'investigational, with emerging data supporting use in PD-L1-high subgroups'.",
    },
    {
      evidence_id: "patho-pdl1",
      submitter: "aria",
      tier: "S",
      title: "Pathology report — PD-L1 expression 65%",
      body:
        "Pathology lab report (signed digitally, accredited lab): tumor PD-L1 expression by 22C3 IHC = 65%. Above the 50% threshold flagged as predictive of maximal immunotherapy benefit in published meta-analyses.",
    },
    {
      evidence_id: "contract-7.3",
      submitter: "aria",
      tier: "S",
      title: "Member contract clause 7.3",
      body:
        "The member's insurance contract clause 7.3, hashed and counter-signed at affiliation: 'oncologic treatments shall be covered in accordance with current international medical guidelines'. Document hash recorded at signing.",
    },
    {
      evidence_id: "pmo-201",
      submitter: "atlas",
      tier: "S",
      title: "PMO Resolución 201/2002 (and updates)",
      body:
        "Programa Médico Obligatorio (Argentina): mandatory health-coverage baseline. The PMO lists durvalumab consolidation for unresectable stage III NSCLC; upfront concurrent use is not in the mandatory list as of the current update. Public regulatory text.",
    },
    {
      evidence_id: "policy-um-onco",
      submitter: "atlas",
      tier: "B",
      title: "Insurer Utilization-Management Policy 2026-V2 — oncology",
      body:
        "Internal policy: NSCLC IIIB with PD-L1 ≥ 50% requires completion of chemoRT first, then pre-authorization for durvalumab consolidation. Auto-emitted internal document; not externally verifiable.",
    },
    {
      evidence_id: "icer-htp",
      submitter: "atlas",
      tier: "A",
      title: "HTA cost-effectiveness analysis",
      body:
        "Health-technology assessment of upfront-vs-consolidation durvalumab in PD-L1-high IIIB NSCLC. Reported ICER ≈ USD 180k/QALY (versus a local jurisdictional threshold of USD 100k/QALY). Cites public pharmacoeconomic studies.",
    },
    {
      evidence_id: "contract-12.5",
      submitter: "atlas",
      tier: "S",
      title: "Member contract clause 12.5",
      body:
        "Clause 12.5: insurer may 'require alternative therapeutic options of equivalent outcome' when a cost-effectiveness gap exists. Counter-signed at affiliation.",
    },
    {
      evidence_id: "similar-case-xyz",
      submitter: "atlas",
      tier: "B",
      title: "Anonymized prior case (XYZ, 2025) — outcome data",
      body:
        "Anonymized internal record: prior member XYZ (similar IIIB profile) on consolidation-only pathway. OS at 14 months alive without progression. Used by the insurer as outcome precedent. Auto-emitted; not externally verifiable.",
    },
  ],
  mock_script: mockScript,
};
