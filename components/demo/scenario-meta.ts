/** User-facing framing per scenario — plain-language story copy. */
export type PartyMeta = {
  name: string;
  role: string;
  side: "claimant" | "respondent";
};

export type ScenarioUnit = "usd" | "treatment" | "renewal" | "scope" | "notice";

export type ScenarioMeta = {
  title: string;
  shortPitch: string;
  intro: string;
  unit: ScenarioUnit;
  /** Human label for "what each agent is moving" (used in card subtitles). */
  movement: string;
  aria: PartyMeta;
  atlas: PartyMeta;
};

export const SCENARIO_META: Record<string, ScenarioMeta> = {
  "ai-overrun": {
    title: "AI overrun",
    shortPitch: "A SaaS team's $180k bill, after a silent regression.",
    intro:
      "A SaaS team says a model update broke their agents and ran the bill up. The provider says the SLA only covers uptime.",
    unit: "usd",
    movement: "credit on the table",
    aria: { name: "Aria", role: "FinOps · the customer", side: "claimant" },
    atlas: { name: "Atlas", role: "AI provider · the account", side: "respondent" },
  },
  oncology: {
    title: "Oncology authorization",
    shortPitch: "An immunotherapy plan, a hospital, and an insurer.",
    intro:
      "Stage IIIB lung cancer. The hospital wants upfront durvalumab. The insurer wants consolidation only. Lives, not dollars, drive the bound — the headline is the treatment tier, not a check.",
    unit: "treatment",
    movement: "treatment tier",
    aria: { name: "Aurora", role: "Hospital · oncology", side: "claimant" },
    atlas: { name: "Cobra", role: "Insurer · adjudication", side: "respondent" },
  },
  "cve-disclosure": {
    title: "CVE disclosure window",
    shortPitch: "A 7-day window, and an expired support contract.",
    intro:
      "An open-source maintainer found a high-severity CVE. A corporate user wants two weeks of notice. The contract that bound them lapsed last month — the lever is annual Premium-support fees.",
    unit: "renewal",
    movement: "annual support fee",
    aria: { name: "Hedge", role: "OSS · maintainer", side: "claimant" },
    atlas: { name: "Bastion", role: "Enterprise · platform", side: "respondent" },
  },
  "creative-brief": {
    title: "Creative brief dispute",
    shortPitch: "Five hero images, one vague brief, $12k owed.",
    intro:
      "Marketing says the work doesn't fit the brand. The studio says the brief was met. Most of the evidence is taste, not invoices.",
    unit: "scope",
    movement: "amount paid",
    aria: { name: "Lyra", role: "Marketing ops", side: "claimant" },
    atlas: { name: "Sigma", role: "Creative studio", side: "respondent" },
  },
  "post-mortem": {
    title: "Joint outage post-mortem",
    shortPitch: "Two infra companies, one outage, words on the line.",
    intro:
      "On April 28 a rotated signing key collided with a strict verifier. Stitcher and Lumea publicly committed to a joint post-mortem before May 12 — the deliberation is the document's wording, the root-cause framing, and what each side promises next time. No money on the table — only the words.",
    unit: "notice",
    movement: "advance notice",
    aria: {
      name: "Stitcher",
      role: "Webhook delivery · platform",
      side: "claimant",
    },
    atlas: {
      name: "Lumea",
      role: "Analytics warehouse · ingestion",
      side: "respondent",
    },
  },
};

export function getScenarioMeta(id: string | undefined): ScenarioMeta {
  return SCENARIO_META[id ?? "ai-overrun"] ?? SCENARIO_META["ai-overrun"]!;
}

export type FormattedValue = {
  primary: string;
  /** Optional secondary hint (e.g. "/yr", "credit", numeric envelope). */
  secondary?: string;
};

/**
 * Map (scenario, credit_usd) → headline + small label per the scenario's
 * unit. Non-money scenarios (oncology) get a text tier, not a dollar amount.
 */
export function formatStateValue(
  unit: ScenarioUnit,
  credit_usd: number,
): FormattedValue {
  if (unit === "usd") {
    return {
      primary: `$${credit_usd.toLocaleString()}`,
      secondary: "credit",
    };
  }
  if (unit === "scope") {
    return {
      primary: `$${credit_usd.toLocaleString()}`,
      secondary: "of the SOW",
    };
  }
  if (unit === "renewal") {
    return {
      primary:
        credit_usd > 0 ? `$${credit_usd.toLocaleString()}` : "$0",
      secondary: "/ yr · premium support",
    };
  }
  if (unit === "notice") {
    // Days of advance notice for a signing-key rotation. No dollars at all.
    return {
      primary: credit_usd > 0 ? `${credit_usd} days` : "No notice",
      secondary: "advance · key rotation",
    };
  }
  // treatment — non-monetary tier label
  let primary = "Insurer default";
  if (credit_usd >= 70000) primary = "Full prescription";
  else if (credit_usd >= 50000) primary = "Upfront immuno · 3 mo";
  else if (credit_usd >= 25000) primary = "Limited upfront + consolidation";
  else if (credit_usd > 0) primary = "Consolidation only";
  return {
    primary,
    secondary:
      credit_usd > 0 ? `coverage envelope ≈ $${credit_usd.toLocaleString()}` : undefined,
  };
}
