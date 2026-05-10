#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import pc from "picocolors";
import { loadEnv } from "../src/env";
import { runPacta, listScenarios, getScenario } from "../src/pacta";

loadEnv();

function parseScenarioFlag(): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--scenario" || a === "-s") return args[i + 1];
    if (a.startsWith("--scenario=")) return a.split("=", 2)[1];
  }
  return process.env.PACTA_SCENARIO;
}

if (process.argv.includes("--list") || process.argv.includes("-l")) {
  console.log(pc.bold("Available scenarios:"));
  for (const s of listScenarios()) {
    console.log(`  ${pc.cyan(s.id.padEnd(14))}  ${s.name}`);
    console.log(pc.gray(`    ${s.description}`));
  }
  process.exit(0);
}

function shortHash(h: string): string {
  return h.length > 18 ? `${h.slice(0, 14)}…${h.slice(-2)}` : h;
}

function shortDid(d: string): string {
  return d.length > 30 ? `${d.slice(0, 15)}…${d.slice(-6)}` : d;
}

function roleTag(scenarioId: string, role: string): string {
  const sc = getScenario(scenarioId);
  if (role === "aria") return pc.cyan(sc.agents.aria.short_label);
  if (role === "atlas") return pc.magenta(sc.agents.atlas.short_label);
  if (role === "tribunal") return pc.yellow("Tribu ");
  return role;
}

function banner(scenarioId: string) {
  const sc = getScenario(scenarioId);
  console.log("");
  console.log(pc.bold(pc.white("╭──────────────────────────────────────────────────────────────────╮")));
  console.log(
    pc.bold(pc.white("│  ⚖")) +
      pc.bold(pc.white("  Pacta — Trust protocol for AI agents in dispute             ")) +
      pc.bold(pc.white("│")),
  );
  console.log(pc.bold(pc.white(`│  Scenario: ${sc.name}`)));
  console.log(pc.gray(`│  ${sc.description}`));
  console.log(
    pc.bold(pc.white("╰──────────────────────────────────────────────────────────────────╯")),
  );
  console.log("");
}

function fmtState(state: Record<string, unknown> | null | undefined): string {
  if (!state || typeof state !== "object") return "{}";
  // Render one key per line for richer schemas (oncology has 4 fields), but
  // keep it inline-readable for the legacy {credit_usd, terms} shape.
  const entries = Object.entries(state).filter(([k]) => k !== "amendments");
  const parts = entries.map(([k, v]) => {
    if (typeof v === "number") {
      const isUsdish = /usd|credit|envelope/i.test(k);
      return `${k}: ${isUsdish ? pc.green("$" + v.toLocaleString()) : pc.green(v.toString())}`;
    }
    if (typeof v === "string") return `${k}: ${pc.gray('"' + v + '"')}`;
    return `${k}: ${pc.gray(JSON.stringify(v))}`;
  });
  return `{ ${parts.join(", ")} }`;
}

async function main() {
  const scenarioId = parseScenarioFlag() ?? "ai-overrun";
  // Validate early
  try {
    getScenario(scenarioId);
  } catch (err) {
    console.error(pc.red((err as Error).message));
    console.error(pc.gray("Run with --list to see available scenarios."));
    process.exit(2);
  }
  banner(scenarioId);

  const useMock = process.env.PACTA_MOCK === "1" || process.argv.includes("--mock");

  if (!useMock && !process.env.ANTHROPIC_API_KEY) {
    console.log(
      pc.yellow(
        "⚠  ANTHROPIC_API_KEY is not set. Falling back to deterministic mock driver.",
      ),
    );
    console.log(
      pc.gray(
        "    For the live LLM demo: cp .env.example .env.local && edit, then re-run.",
      ),
    );
    console.log("");
  }
  const mock = useMock || !process.env.ANTHROPIC_API_KEY;
  if (mock) {
    console.log(pc.gray("Mode: mock (no LLM calls)"));
  } else {
    console.log(pc.gray("Mode: live (Claude — sonnet-4-5)"));
  }

  let currentRound = 0;
  const start = Date.now();
  let bundle: Awaited<ReturnType<typeof runPacta>> extends AsyncGenerator<infer _E, infer R, infer __> ? R : never;
  // ^ tighter typing not needed for cli; use any

  for await (const ev of runPacta({ mock, scenario: scenarioId })) {
    switch (ev.kind) {
      case "scenario.selected":
        break;
      case "agent.boot":
        console.log(`  ✓ ${roleTag(scenarioId, ev.role)}  ${shortDid(ev.did)}`);
        break;
      case "evidence.loaded":
        console.log("");
        console.log(pc.bold(`Loading evidence pool…`));
        for (const e of ev.items) {
          const tierColor =
            e.tier === "S" ? pc.green : e.tier === "A" ? pc.cyan : e.tier === "B" ? pc.yellow : pc.gray;
          console.log(`  ${tierColor("[" + e.tier + "]")}  ${pc.gray(shortHash(e.hash))}  ${e.id}`);
        }
        console.log(pc.gray(`  All ${ev.count} items signed and content-addressed ✓`));
        break;
      case "round.start":
        currentRound = ev.round;
        console.log("");
        console.log(pc.bold(pc.white(`— Round ${ev.round} ${"─".repeat(58)}`)));
        break;
      case "message.rejected":
        console.log(
          `  ${pc.red("✗")} ${roleTag(scenarioId, ev.role)}  ${pc.red("rejected")}  ${pc.gray("attempt " + ev.attempt + ":")} ${ev.reason}`,
        );
        break;
      case "turn.skipped":
        console.log(
          `  ${pc.red("⊘")} ${roleTag(scenarioId, ev.role)}  ${pc.red("turn skipped after " + ev.attempts + " attempts:")} ${pc.gray(ev.reason)}`,
        );
        break;
      case "message.accepted": {
        const m = ev.signed;
        const tag = roleTag(scenarioId, ev.role);
        const head = `  ${pc.green("▶")} ${tag} ${pc.bold(m.type.padEnd(18))}  ${pc.gray(shortHash(ev.hash))}  ${pc.green("Ed25519 ✓")}`;
        console.log(head);
        if (m.type === "Propose" || m.type === "CounterPropose") {
          console.log(`        state: ${fmtState(m.payload.state)}`);
          console.log(
            pc.gray(`        utility: ${m.payload.utility_for_self.toFixed(2)}    refs: ${m.evidence_refs.length}`),
          );
          if (m.payload.rationale) {
            const text = m.payload.rationale.length > 140 ? m.payload.rationale.slice(0, 140) + "…" : m.payload.rationale;
            console.log(pc.gray(`        "${text}"`));
          }
        } else if (m.type === "Critique") {
          console.log(pc.gray(`        target: ${shortHash(m.payload.target_msg_hash)}`));
          if (m.payload.rationale)
            console.log(pc.gray(`        "${m.payload.rationale.slice(0, 140)}"`));
        } else if (m.type === "Reveal") {
          console.log(pc.gray(`        domain: ${m.payload.domain}`));
          console.log(pc.gray(`        "${m.payload.information.slice(0, 140)}"`));
        } else if (m.type === "Accept") {
          console.log(pc.gray(`        accepts: ${shortHash(m.payload.target_msg_hash)}`));
        } else if (m.type === "Escalate") {
          console.log(pc.gray(`        reason: ${m.payload.reason}  →  ${m.payload.requested_action}`));
        }
        break;
      }
      case "convergence":
        console.log("");
        console.log(
          pc.bold(pc.green("✅  CONVERGED  ")) +
            pc.gray(`in ${currentRound} rounds (${((Date.now() - start) / 1000).toFixed(1)}s wall)`),
        );
        console.log("   Final state:    " + fmtState(ev.final_state));
        console.log("   Accepted hash:  " + pc.gray(shortHash(ev.accepted_msg_hash)));
        break;
      case "deadline":
        console.log("");
        console.log(pc.yellow("⏱  Max rounds reached without convergence."));
        break;
      case "deadlock":
        console.log("");
        console.log(pc.yellow(`⏸  Deadlock: ${ev.reason}`));
        break;
      case "escalation":
        console.log(pc.yellow(`↗  Escalating to Tribunal (${ev.reason})…`));
        break;
      case "jury.start":
        console.log("");
        console.log(pc.bold(pc.yellow(`— Tribunal deliberation ${"─".repeat(46)}`)));
        break;
      case "jury.vote":
        console.log(
          `  ${pc.yellow("⚖")} Juror ${pc.bold(ev.vote.juror)} (${pc.gray(ev.vote.juror_model)})  →  ${pc.bold(ev.vote.outcome)}  ${pc.gray("conf " + ev.vote.confidence.toFixed(2))}`,
        );
        if (ev.vote.rationale) {
          const text = ev.vote.rationale.length > 200 ? ev.vote.rationale.slice(0, 200) + "…" : ev.vote.rationale;
          console.log(pc.gray(`        "${text}"`));
        }
        break;
      case "jury.ruling": {
        console.log("");
        const isAbstain = ev.ruling.outcome === "abstain";
        const tag = isAbstain
          ? pc.red("⚖  INCONCLUSIVE  ")
          : pc.yellow("⚖  RULING  ");
        console.log(
          pc.bold(tag) +
            pc.bold(ev.ruling.outcome) +
            pc.gray(`  conf ${ev.ruling.confidence.toFixed(2)}`),
        );
        if (isAbstain) {
          console.log(
            pc.red("   Pacta recommends appeal to Pacta Court tier (human review)."),
          );
        }
        console.log("   Remedy: " + fmtState(ev.ruling.remedy));
        break;
      }
      case "bundle": {
        const b = ev.bundle;
        bundle = b;
        console.log("");
        console.log(pc.bold("Bundle"));
        console.log("   messages:      " + b.messages.length);
        console.log("   evidence:      " + b.evidence.length);
        console.log("   outcome.kind:  " + pc.bold(b.outcome.kind));
        console.log("   root_hash:     " + pc.gray(shortHash(b.root_hash)));
        mkdirSync("tmp/runs", { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const modeTag = mock ? "mock" : "live";
        const archivePath = `tmp/runs/${b.scenario}-${modeTag}-${ts}.json`;
        const json = JSON.stringify(b, null, 2);
        writeFileSync(archivePath, json);
        writeFileSync("tmp/last-run.json", json);
        console.log("   saved:         " + pc.cyan(archivePath));
        console.log("   alias:         " + pc.gray("tmp/last-run.json"));
        console.log(pc.gray("   verify with:   pnpm verify " + archivePath));
        break;
      }
    }
  }
  console.log("");
}

main().catch((err) => {
  console.error(pc.red("Demo failed:"), err);
  process.exit(1);
});
