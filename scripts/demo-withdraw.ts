#!/usr/bin/env tsx
/**
 * One-shot demo: open a dispute with both controllers EXTERNAL (no seed loop)
 * then call withdrawFromDispute to exercise the unilateral exit path.
 * Prints the resulting bundle so the dashboard can render it.
 */
import { loadEnv } from "../src/env";
import { openDispute } from "../src/dispute_store";
import { withdrawFromDispute } from "../src/dispute_engine";

loadEnv();

async function main() {
  const open = await openDispute({
    claim:
      "Demo: vendor missed delivery. Customer wants the SLA penalty. " +
      "Mode = binding tribunal, but customer walks before the agents converge.",
    your_role: "aria",
    counterparty_external: true,
    tribunal_mode: "binding",
    max_rounds: 5,
  });

  console.log("Opened dispute:", open.dispute_id);
  console.log("  tribunal_mode:", open.tribunal_mode);
  console.log("  counterparty_external:", open.counterparty_external);

  const r = await withdrawFromDispute({
    dispute_id: open.dispute_id,
    role_token: open.your_token,
    reason:
      "Aria withdraws — counterparty has not engaged in good faith. " +
      "Closing on record so any downstream system has the audit trail.",
  });

  console.log("\nWithdraw events:");
  for (const ev of r.events) {
    if (ev.kind === "bundle.built") {
      console.log("  bundle.built — outcome.kind:", ev.bundle.outcome.kind);
    } else {
      console.log("  ", JSON.stringify(ev).slice(0, 120));
    }
  }
  console.log("\nDispute id (open in dashboard):", open.dispute_id);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
