#!/usr/bin/env tsx
/**
 * Quick analyzer: tabulate jury votes / compound confidence / outcomes across
 * a set of bundle JSON paths. Useful for assessing stability of jury splits.
 */
import { readFileSync } from "node:fs";
import type { Bundle, SignedVote } from "../src/types";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: pnpm analyze <bundle.json>...");
  process.exit(2);
}

type Row = {
  file: string;
  scenario: string;
  rounds: number;
  msgs: number;
  bilateral: string;
  jurorVotes: string;
  compoundConf: number | null;
  ruling_outcome: string;
  remedy: string;
  inconclusive: boolean;
};

function votePill(v: SignedVote): string {
  const o = v.outcome
    .replace("claimant_partial", "PART")
    .replace("claimant_prevails", "C-WIN")
    .replace("respondent_prevails", "R-WIN")
    .replace("abstain", "ABS");
  return `${v.juror[0]}:${o}/${Number(v.confidence).toFixed(2)}`;
}

const rows: Row[] = [];
for (const p of paths) {
  const b = JSON.parse(readFileSync(p, "utf-8")) as Bundle;
  const lastRound = b.messages.length > 0 ? Math.max(...b.messages.map((m) => m.round)) : 0;
  let bilateral = "—";
  if (b.outcome.kind === "converged") bilateral = "CONVERGED";
  else if (b.outcome.kind === "ruling") bilateral = "FAILED";
  else bilateral = b.outcome.kind;

  let jurorVotes = "—";
  let compoundConf: number | null = null;
  let ruling_outcome = "—";
  let remedy = "—";
  let inconclusive = false;
  if (b.outcome.kind === "ruling") {
    jurorVotes = b.outcome.votes.map(votePill).join(" | ");
    compoundConf = b.outcome.ruling.confidence;
    ruling_outcome = b.outcome.ruling.outcome;
    remedy = `$${(b.outcome.ruling.remedy.credit_usd / 1_000_000).toFixed(2)}M`;
    inconclusive = b.outcome.ruling.outcome === "abstain";
  } else if (b.outcome.kind === "converged") {
    remedy = `$${(b.outcome.final_state.credit_usd / 1_000_000).toFixed(2)}M`;
  }
  rows.push({
    file: p.replace("tmp/runs/", ""),
    scenario: b.scenario,
    rounds: lastRound,
    msgs: b.messages.length,
    bilateral,
    jurorVotes,
    compoundConf,
    ruling_outcome,
    remedy,
    inconclusive,
  });
}

console.log(
  ["#", "rounds", "msgs", "bilateral", "votes (Aequitas|Utilis|Velox)", "conf", "ruling", "remedy"]
    .map((s) => s.padEnd(10))
    .join("  "),
);
console.log("-".repeat(140));
rows.forEach((r, i) => {
  console.log(
    [
      String(i + 1).padEnd(2),
      String(r.rounds).padEnd(6),
      String(r.msgs).padEnd(4),
      r.bilateral.padEnd(10),
      r.jurorVotes.padEnd(60),
      (r.compoundConf?.toFixed(2) ?? "—").padEnd(5),
      r.ruling_outcome.padEnd(18),
      r.remedy.padEnd(8) + (r.inconclusive ? "  ⚠ INCONCLUSIVE" : ""),
    ].join("  "),
  );
});
console.log("");

// Summary stats
const ruled = rows.filter((r) => r.bilateral === "FAILED");
const inconclusiveCount = ruled.filter((r) => r.inconclusive).length;
console.log(`Total runs:           ${rows.length}`);
console.log(`Bilateral converged:  ${rows.filter((r) => r.bilateral === "CONVERGED").length}`);
console.log(`Escalated to jury:    ${ruled.length}`);
console.log(`  → unanimous:        ${ruled.filter((r) => !r.inconclusive && r.compoundConf && r.compoundConf >= 0.7).length}`);
console.log(`  → conclusive split: ${ruled.filter((r) => !r.inconclusive && r.compoundConf && r.compoundConf < 0.7).length}`);
console.log(`  → INCONCLUSIVE:     ${inconclusiveCount}`);
