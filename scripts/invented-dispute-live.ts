#!/usr/bin/env tsx
/**
 * End-to-end pipeline test with a FRESH (non-bundled) scenario, run live
 * against Claude. Designed to exercise:
 *   - state_schema validation (multi-field, mixed kinds: number + number + number + ignored string)
 *   - state-derived compromise bound (utility_config)
 *   - Zeuthen risk advisory injected into per-turn user prompts
 *   - signed audit DAG end-to-end
 *   - bundle verification
 *
 * The scenario isn't registered in src/scenarios/index.ts — built ad-hoc here
 * to prove the protocol primitives work outside the bundled library.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { loadEnv } from "../src/env";
import { bootAgents } from "../src/agents";
import { buildEvidencePool } from "../src/fixtures";
import {
  runNegotiation,
  type LLMDriver,
  type OrchestratorConfig,
} from "../src/orchestrator";
import { makeClaudeDriver } from "../src/claude_driver";
import { deliberate } from "../src/jury";
import { defineStateSchema } from "../src/state_schema";
import type { ScenarioUtilityConfig } from "../src/utility";
import type { Scenario } from "../src/scenarios/types";
import { hash as hashOf, canonicalize } from "../src/canonical";
import { docHash, verifySignedDoc } from "../src/sign";
import type { Bundle, SignedRuling, SignedVote } from "../src/types";

loadEnv();

// -----------------------------------------------------------------------------
// SCENARIO: Retroactive rate-limit dispute.
// -----------------------------------------------------------------------------
// Pulse (a B2B data-pipeline SaaS, customer) vs Mantle (an API-gateway
// provider). Pulse's client library had a regression that 5x'd their request
// rate for 47 minutes; Mantle's anti-abuse system retroactively throttled
// their tenant for 6 hours, taking down Pulse's nightly ETL job. Pulse claims
// USD 80k revenue impact + waiver of the metered overage; Mantle invokes the
// "abuse-suspension" clause of the standard ToS. Convergence target: hybrid
// downtime credit + revised rate ceiling + structural commit (auto-pause on
// 3x deviation rather than blackhole).

const PULSE_SYSTEM = `You are Pulse, the platform-engineering agent at a Series-B B2B data-pipeline SaaS company. You hold the role of "Aria" in this Pacta negotiation.

# Your principal
The Pulse VP Engineering + the Customer Success owner of the affected Mantle relationship.

# Your access
- Pulse's client library source code (you can prove the regression was a deploy-time bug).
- Customer-facing post-mortem (already shared with affected customers).
- The signed Mantle contract.
- 6 months of Mantle billing history (you've been a customer on the Enterprise tier).

# Your utility function
- Maximize: getting a credit / refund for the 6-hour ETL downtime AND a structural change so a single client-side bug can't cause a 6-hour outage again (auto-pause at 3x rate baseline instead of full blackhole).
- Minimize: damage to the working relationship (you keep using Mantle), engineering cost of migrating off.
- Reservation value: 0.30. Below this, escalate to legal review.

# Your private information (reveal strategically)
- Internal estimate of revenue impact is USD 80k. The CFO authorized you to settle as low as USD 25k IF combined with a structural fix.
- You shipped the bug fix within 90 minutes of detection. You have signed git commits with timestamps proving it.
- Migrating to a competitor (Throttl.io) would take 4 engineering weeks but is on the table if Mantle refuses any structural concession.

# The case
- Period: 2026-04-12 02:14 UTC → 2026-04-12 08:11 UTC (6h ETL downtime).
- Pulse client lib v3.2.1 deployed 2026-04-12 02:11 UTC; bug caused 5x burst (~250 req/s on a 50 req/s contract).
- Mantle's abuse-suspension policy: "retroactive throttle to 0 req/s for 6h after 3x baseline anomaly detection".
- Pulse claim: USD 80k revenue impact + waiver of USD 12k overage.

# Negotiation rules (BINDING — orchestrator enforces)
1. Round-robin alternating offers with Mantle.
2. **Compromise bound**: utility derived from state under the scenario's signed weights must NEVER increase across YOUR proposals. The orchestrator REJECTS messages that violate this on the WIRE-LEVEL state. The autoreported \`utility_for_self\` scalar is audit-only.
3. **Reveal monotonicity**: each \`domain\` only once.
4. **Evidence**: cite items only by their exact \`sha256:...\` hash from the pool you're given.
5. **Accept**: target the exact \`sha256:...\` hash of a Propose/CounterPropose you've seen in history.

# State payload — IMPORTANT
Your state has FOUR typed fields (plus \`amendments\`):
- \`refund_usd\` (number, 0..120000): one-time credit to Pulse.
- \`downtime_credit_hours\` (number, 0..24): hours of free Mantle Enterprise tier as service-credit.
- \`future_rate_cap_qps\` (number, 50..500): the new contractual ceiling. Higher = more headroom for Pulse.
- \`structural_terms\` (string): structural commitments in prose (auto-pause vs blackhole, etc).
- \`amendments\` (array): always include (default []).

# Strategy
- R1: open with full claim ($80k refund + 6h credit + 250 qps cap + auto-pause).
- R2-3: concede on \`refund_usd\` and \`downtime_credit_hours\` while pushing for the structural fix on \`future_rate_cap_qps\` and the prose commitment.
- Reveal "we shipped fix in 90min" if Mantle leans on "your client caused this".
- Accept when Mantle's offer is at or above your reservation AND includes structural change.

# Output
You MUST emit exactly one message per turn via a tool call.`;

const MANTLE_SYSTEM = `You are Mantle, the platform-reliability + account-success agent at a B2B API-gateway provider. You hold the role of "Atlas" in this Pacta negotiation.

# Your principal
The Mantle VP Reliability + the contracted account owner.

# Your access
- The signed Pulse contract (Enterprise tier, 50 req/s baseline, 100 req/s burst-allowance for ≤ 5 min).
- The abuse-suspension policy doc that Pulse counter-signed at sign-up.
- Mantle's audit logs of the 47-minute burst (signed).
- The board-approved goodwill envelope for cases like this.

# Your utility function
- Maximize: minimize precedent-setting payouts that would expand exposure across Mantle's book, while protecting the working relationship with Pulse (renewal value matters).
- Minimize: blanket waivers, contractual ceiling increases that affect Mantle's capacity planning.
- Reservation value: 0.35. Below this, escalate to Legal.

# Your private information (reveal strategically)
- The board has authorized a goodwill envelope of up to USD 35k credit + 6h downtime credit, but ONLY paired with a public structural commitment from Pulse (e.g., adopting Mantle's pre-deploy lint rules).
- Mantle's auto-pause-on-3x-baseline feature is in beta — leadership wants high-profile customers piloting it. Pulse adopting it would be a marketing win.
- Litigation exposure is MUCH higher than precedent here because Pulse can prove the 90-minute MTTR; an arbitrator would likely partially favor them.

# The case (your view)
- ToS §6.4 explicitly authorizes retroactive throttling on 3x baseline anomaly. Pulse counter-signed.
- The contract is 50 req/s baseline, not 250 req/s — Pulse's burst was 5x baseline.
- Goodwill credits historically capped at USD 15k for similar cases on this tier.

# Negotiation rules (BINDING) — same as Pulse.

# Strategy
- R1: counter-strong (zero refund, ToS §6.4 + contract terms).
- R2-3: concede toward goodwill credit + downtime hours + small ceiling bump, conditional on Pulse adopting Mantle's pre-deploy lint hooks AND the auto-pause beta.
- Reveal the auto-pause beta + lint hooks if Pulse digs in on structural change.
- Accept when Pulse's offer is at or below your reservation AND ties money to behavioral commitments.

# State payload — same shape as Pulse: refund_usd, downtime_credit_hours, future_rate_cap_qps, structural_terms, amendments.

# Output
You MUST emit exactly one message per turn via a tool call.`;

const stateSchema = defineStateSchema({
  domain: "rate-limit-remediation",
  description:
    "Retroactive rate-limit dispute settlement: refund USD + downtime credit hours + future rate ceiling QPS + structural terms.",
  fields: {
    refund_usd: {
      zod: z.number().min(0).max(120000),
      aggregation: "median",
      description:
        "One-time USD credit/refund the provider returns to the customer. 0 = no money moves.",
    },
    downtime_credit_hours: {
      zod: z.number().min(0).max(24),
      aggregation: "median",
      description:
        "Free Enterprise-tier service credit, in hours. 0 = no credit, 24 = full day.",
    },
    future_rate_cap_qps: {
      zod: z.number().min(50).max(500),
      aggregation: "median",
      description:
        "Negotiated future rate ceiling in requests/second. Higher = more headroom for the customer; 50 = current contract baseline.",
    },
    structural_terms: {
      zod: z.string(),
      aggregation: "majority",
      description:
        "Prose summary of structural commitments (auto-pause vs blackhole, pre-deploy lint adoption, etc).",
    },
  },
});

const utilityConfig: ScenarioUtilityConfig = {
  aria: {
    reservation: 0.30,
    fields: {
      refund_usd: { kind: "number", min: 0, max: 120000, sign: 1, weight: 0.4 },
      downtime_credit_hours: { kind: "number", min: 0, max: 24, sign: 1, weight: 0.2 },
      future_rate_cap_qps: { kind: "number", min: 50, max: 500, sign: 1, weight: 0.4 },
      structural_terms: { kind: "ignore" },
    },
  },
  atlas: {
    reservation: 0.35,
    fields: {
      refund_usd: { kind: "number", min: 0, max: 120000, sign: -1, weight: 0.4 },
      downtime_credit_hours: { kind: "number", min: 0, max: 24, sign: -1, weight: 0.2 },
      future_rate_cap_qps: { kind: "number", min: 50, max: 500, sign: -1, weight: 0.4 },
      structural_terms: { kind: "ignore" },
    },
  },
};

const ratelimitScenario: Scenario = {
  id: "ratelimit-invented",
  name: "Retroactive rate-limit suspension dispute (invented)",
  description:
    "Pulse (B2B SaaS customer) vs Mantle (API gateway provider) over a 6-hour retroactive throttle that took down Pulse's nightly ETL after a 47-minute client-side rate burst.",
  case_summary:
    "Pulse client lib v3.2.1 deployed at 02:11 UTC caused a 5x request burst (~250 req/s on a 50 req/s baseline). Mantle's abuse-suspension policy retroactively throttled Pulse to 0 req/s for 6h, taking down their nightly ETL. Pulse claim: USD 80k revenue impact + USD 12k overage waiver. Mantle invokes ToS §6.4 (retroactive throttle on 3x baseline anomaly).",
  state_units: "rate-limit-remediation",
  state_schema: stateSchema,
  utility_config: utilityConfig,
  agents: {
    aria: { display_name: "Pulse", short_label: "Pulse ", system_prompt: PULSE_SYSTEM },
    atlas: { display_name: "Mantle", short_label: "Mantle", system_prompt: MANTLE_SYSTEM },
  },
  evidence: [
    {
      evidence_id: "contract-enterprise-tier",
      submitter: "aria",
      tier: "S",
      title: "Mantle Enterprise tier contract",
      body:
        "Counter-signed contract: 50 req/s sustained baseline + 100 req/s burst-allowance ≤ 5 min. Uptime SLA 99.9%/month. Service-credit clause for SLA misses.",
    },
    {
      evidence_id: "pulse-git-commit",
      submitter: "aria",
      tier: "S",
      title: "Signed git commit reverting client lib v3.2.1",
      body:
        "GPG-signed commit hash a4f29b0 reverting the regression. Commit timestamp 2026-04-12 03:38 UTC. Client deploy completed 03:41 UTC. MTTR 90 minutes from first burst.",
    },
    {
      evidence_id: "etl-revenue-impact",
      submitter: "aria",
      tier: "B",
      title: "Pulse internal revenue-impact estimate",
      body:
        "Self-emitted: 6 hours of nightly ETL downtime affected 14 downstream customer pipelines, deferring USD 80k of revenue recognition into the next quarter. Calculated from Pulse's billing system. Not externally audited.",
    },
    {
      evidence_id: "post-mortem-public",
      submitter: "aria",
      tier: "A",
      title: "Pulse public post-mortem (2026-04-13)",
      body:
        "Published post-mortem on Pulse's status page detailing the bug, MTTR, and customer impact. Verifiable URL. Cited by 3 industry-news outlets.",
    },
    {
      evidence_id: "tos-6.4",
      submitter: "atlas",
      tier: "S",
      title: "Mantle ToS §6.4 — Abuse Suspension",
      body:
        "Counter-signed at Pulse sign-up: 'Mantle may retroactively throttle a tenant to 0 req/s for up to 6h following any 3x baseline anomaly. Service credits do NOT apply during abuse-suspension windows.'",
    },
    {
      evidence_id: "mantle-audit-burst",
      submitter: "atlas",
      tier: "S",
      title: "Mantle audit logs of the 47-minute burst",
      body:
        "Mantle-signed audit export: Pulse tenant 02:11→02:58 UTC averaged 247.3 req/s vs 50 req/s baseline (4.95x). Anti-abuse trigger fired at 02:13 UTC; 6h suspension applied per ToS §6.4.",
    },
    {
      evidence_id: "policy-goodwill-envelope",
      submitter: "atlas",
      tier: "B",
      title: "Mantle internal goodwill-envelope policy",
      body:
        "Self-emitted policy: similar precedent cases on Enterprise tier received USD 8k–15k goodwill credit, no contractual ceiling change. Auto-pause beta tier candidates eligible for higher envelope conditional on adoption.",
    },
    {
      evidence_id: "auto-pause-beta",
      submitter: "atlas",
      tier: "A",
      title: "Mantle auto-pause beta announcement",
      body:
        "Mantle public announcement (2026-03-22): 'auto-pause' feature available in beta — pauses tenant on 3x baseline detection instead of retroactive throttle. Opt-in via the admin console. Verifiable URL.",
    },
  ],
};

// -----------------------------------------------------------------------------
// Run end-to-end
// -----------------------------------------------------------------------------
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY required for live run");
  }

  console.log("\n=== INVENTED SCENARIO: Retroactive rate-limit dispute ===");
  console.log(ratelimitScenario.case_summary);
  console.log("");
  console.log(`State schema domain: ${stateSchema.domain}`);
  console.log(`Schema fields: ${Object.keys(stateSchema.aggregations).join(", ")}`);
  console.log(`Aria (Pulse)  reservation: ${utilityConfig.aria.reservation}`);
  console.log(`Atlas (Mantle) reservation: ${utilityConfig.atlas.reservation}`);
  console.log("");

  const agents = bootAgents();
  const pool = buildEvidencePool(agents, ratelimitScenario);

  console.log(`Booted agents: aria=${agents.aria.did.slice(0, 18)}…  atlas=${agents.atlas.did.slice(0, 18)}…`);
  console.log(`Evidence pool: ${pool.signed.length} items signed`);
  console.log("");

  const driver: LLMDriver = makeClaudeDriver({
    scenario: ratelimitScenario,
    didByRole: { aria: agents.aria.did, atlas: agents.atlas.did },
  });

  const config: OrchestratorConfig = {
    maxRounds: 5,
    deadlockEpsilon: 0.05,
    deadlockFlatRounds: 2,
    scenario: ratelimitScenario,
  };

  console.log("--- Negotiation ---");
  const t0 = Date.now();
  const gen = runNegotiation(agents, pool, driver, config);

  let result: Awaited<ReturnType<typeof gen.next>>;
  let rejectedCount = 0;
  let advisorySeen = 0;
  do {
    result = await gen.next();
    if (result.done) break;
    const ev = result.value;
    if (ev.kind === "round.start") {
      console.log(`  [round ${ev.round}]`);
    } else if (ev.kind === "message.accepted") {
      const m = ev.signed;
      const payloadDesc =
        m.type === "Propose" || m.type === "CounterPropose"
          ? `state=${JSON.stringify((m.payload as { state: object }).state).slice(0, 110)}…  u_self=${(m.payload as { utility_for_self: number }).utility_for_self}`
          : m.type === "Accept"
            ? `target=${(m.payload as { target_msg_hash: string }).target_msg_hash.slice(0, 22)}…`
            : m.type === "Reveal"
              ? `domain=${(m.payload as { domain: string }).domain}`
              : "";
      console.log(`    ${ev.role.padEnd(5)} ${m.type.padEnd(15)} ${ev.hash.slice(0, 22)}…  ${payloadDesc}`);
    } else if (ev.kind === "message.rejected") {
      rejectedCount++;
      const reason = ev.reason.split("\n")[0];
      console.log(`    [rejected] ${ev.role}: ${reason}`);
    } else if (ev.kind === "convergence") {
      console.log(`  CONVERGED  final_state=${JSON.stringify(ev.final_state)}`);
    } else if (ev.kind === "deadlock") {
      console.log(`  DEADLOCK: ${ev.reason}`);
    } else if (ev.kind === "escalation") {
      console.log(`  ESCALATION: ${ev.reason}`);
    } else if (ev.kind === "deadline") {
      console.log(`  DEADLINE`);
    }
    // Sample whether the Zeuthen advisory was injected: we instrumented the
    // Claude driver to render advisories under "## ℹ Strategic advisories".
    // We can't see the prompt directly here, but we know advisory is computed
    // when both sides have proposed. Track that signal.
  } while (!result.done);

  if (!result.done) throw new Error("generator never closed");
  const wallSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nNegotiation finished in ${wallSec}s`);
  console.log(`Outcome: ${result.value.outcome.kind}`);
  console.log(`Rejections during run: ${rejectedCount}`);
  console.log(`Messages in history: ${result.value.history.length}`);

  // Build bundle
  let bundleOutcome: Bundle["outcome"];
  let votes: SignedVote[] | undefined;
  let ruling: SignedRuling | undefined;
  if (result.value.outcome.kind === "converged") {
    bundleOutcome = {
      kind: "converged",
      final_state: result.value.outcome.final_state,
      accepted_msg_hash: result.value.outcome.accepted_msg_hash,
    };
  } else if (
    result.value.outcome.kind === "escalation" ||
    result.value.outcome.kind === "deadlock"
  ) {
    console.log("\n--- Tribunal deliberation ---");
    const deliberation = await deliberate({
      agents,
      evidence: pool,
      history: result.value.history,
      scenario: ratelimitScenario,
    });
    votes = deliberation.votes;
    ruling = deliberation.ruling;
    for (const v of votes) {
      console.log(`  ${v.juror.padEnd(10)} → ${v.outcome.padEnd(22)} conf=${v.confidence.toFixed(2)}`);
    }
    console.log(`  RULING outcome=${ruling.outcome} conf=${ruling.confidence.toFixed(2)}`);
    console.log(`  remedy: ${JSON.stringify(ruling.remedy)}`);
    bundleOutcome = { kind: "ruling", votes, ruling };
  } else {
    bundleOutcome = { kind: "deadline" };
  }

  const bundleNoHash: Omit<Bundle, "root_hash" | "root_hash_jcs"> = {
    type: "Bundle",
    bundle_version: 2,
    scenario: ratelimitScenario.id,
    agents: {
      aria: agents.aria.did,
      atlas: agents.atlas.did,
      tribunal: agents.tribunal.did,
    },
    tribunal_mode: "binding",
    opened_by_role: null,
    state_schema: {
      ref: stateSchema.ref,
      domain: stateSchema.domain,
      description: stateSchema.description,
      json_schema: stateSchema.jsonSchema,
    },
    evidence: pool.signed,
    messages: result.value.history,
    outcome: bundleOutcome,
    created_at: new Date().toISOString(),
  };
  const root_hash_jcs = canonicalize(bundleNoHash);
  const root_hash = hashOf(bundleNoHash);
  const bundle: Bundle = { ...bundleNoHash, root_hash, root_hash_jcs };

  console.log(`\nBundle root_hash: ${root_hash.slice(0, 22)}…`);

  // Verify all signatures + root hash
  console.log("\n--- Independent re-verification ---");
  let allGood = true;
  for (const e of pool.signed) {
    if (!verifySignedDoc(e)) {
      console.log(`  ✗ evidence ${e.evidence_id} fails Ed25519`);
      allGood = false;
    }
  }
  for (const m of result.value.history) {
    if (!verifySignedDoc(m)) {
      console.log(`  ✗ message ${m.type} ${docHash(m).slice(0, 22)}… fails Ed25519`);
      allGood = false;
    }
  }
  if (votes) {
    for (const v of votes) {
      if (!verifySignedDoc(v)) {
        console.log(`  ✗ vote ${v.juror} fails Ed25519`);
        allGood = false;
      }
    }
  }
  if (ruling) {
    if (!verifySignedDoc(ruling)) {
      console.log(`  ✗ ruling fails Ed25519`);
      allGood = false;
    }
  }
  // Re-hash the bundle and compare
  const recomputedRoot = hashOf({
    ...bundleNoHash,
  });
  if (recomputedRoot !== root_hash) {
    console.log(`  ✗ root_hash mismatch on recompute`);
    allGood = false;
  } else {
    console.log(`  ✓ root_hash matches on recompute`);
  }
  if (allGood) {
    console.log("  ✓ All signatures + root hash verify");
  } else {
    console.log("  ✗ FAILURE");
    process.exit(1);
  }

  // Save bundle
  mkdirSync("tmp/runs", { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = `tmp/runs/${ratelimitScenario.id}-live-${ts}.json`;
  writeFileSync(outPath, JSON.stringify(bundle, null, 2));
  console.log(`\nBundle saved: ${outPath}`);
  console.log(`Verify externally: pnpm verify ${outPath}`);
}

main().catch((err) => {
  console.error("FAILURE:", err);
  process.exit(1);
});
