/**
 * Reusable state-schema builders for the bundled scenarios.
 *
 * The 4 USD-credit scenarios (ai-overrun, creative-brief, cve-disclosure,
 * deadlock-fairuse) share a `{ credit_usd, terms }` shape. Oncology and
 * deadlock-leak declare their own bespoke schemas in their scenario files.
 */
import { z } from "zod";
import { defineStateSchema, type StateSchemaResult } from "../state_schema";

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
