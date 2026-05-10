/**
 * Reusable state-schema builders for the bundled scenarios.
 *
 * The 4 USD-credit scenarios (ai-overrun, creative-brief, cve-disclosure,
 * deadlock-fairuse) share a `{ credit_usd, terms }` shape. Oncology and
 * deadlock-leak declare their own bespoke schemas in their scenario files.
 */
import { z } from "zod";
import { defineStateSchema, type StateSchemaResult } from "../state_schema";
import type { ScenarioUtilityConfig } from "../utility";

/** Standard USD-credit + terms-string schema, shared by 4 of the 6 bundled
 *  scenarios. The `cap` argument lets the schema enforce a per-scenario upper
 *  bound on the credit number (the AI training fair-use case goes up to USD
 *  20M, the SaaS-overage case caps at USD 250k). */
export function usdCreditSchema(opts: {
  domain?: string;
  description?: string;
  /** Upper bound on credit_usd. Defaults to no cap. */
  cap?: number;
}): StateSchemaResult {
  const max = opts.cap ?? Number.MAX_SAFE_INTEGER;
  return defineStateSchema({
    domain: opts.domain ?? "USD-credit",
    description:
      opts.description ??
      "Settlement state expressed in USD credit + free-form terms.",
    fields: {
      credit_usd: {
        zod: z.number().min(0).max(max),
        aggregation: "median",
        description:
          "USD amount changing hands as credit / refund / settlement. " +
          "0 if no money moves.",
      },
      terms: {
        zod: z.string(),
        aggregation: "majority",
        description:
          "Short human-readable summary of the structural commitments " +
          "(e.g. 'credit + alerts opt-in', 'refund + acknowledgment').",
      },
    },
  });
}

/** Standard utility config for USD-credit scenarios. Default convention:
 *  aria = claimant (wants high credit, sign=+1), atlas = respondent (wants
 *  low credit, sign=-1). Pass `aria_sign` / `atlas_sign` explicitly when the
 *  scenario inverts roles (e.g. creative-brief: aria is the CUSTOMER who
 *  doesn't want to pay, so aria_sign=-1).
 *
 *  The `terms` field is qualitative free-form prose — kept ignored in the
 *  utility sum because it doesn't map cleanly to a [0,1] score. */
export function usdCreditUtilityConfig(opts: {
  cap: number;
  aria_sign?: 1 | -1;
  atlas_sign?: 1 | -1;
  reservation_aria?: number;
  reservation_atlas?: number;
}): ScenarioUtilityConfig {
  return {
    aria: {
      reservation: opts.reservation_aria ?? 0.30,
      fields: {
        credit_usd: {
          kind: "number",
          min: 0,
          max: opts.cap,
          sign: opts.aria_sign ?? 1,
          weight: 1,
        },
        terms: { kind: "ignore" },
      },
    },
    atlas: {
      reservation: opts.reservation_atlas ?? 0.35,
      fields: {
        credit_usd: {
          kind: "number",
          min: 0,
          max: opts.cap,
          sign: opts.atlas_sign ?? -1,
          weight: 1,
        },
        terms: { kind: "ignore" },
      },
    },
  };
}
