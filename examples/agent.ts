#!/usr/bin/env tsx
/**
 * External Pacta agent: a CLI that acts as one organization's autonomous agent
 * in a Pacta dispute. Connects to the Pacta MCP server (default: production),
 * uses Claude with the role's system prompt to decide what to send each turn,
 * and submits via MCP. Polls for its next turn between calls.
 *
 * Usage:
 *   # Opener (one terminal)
 *   pnpm agent --role aria  --open creative-brief
 *   #   → prints dispute_id and the OTHER side's token; share both with peer.
 *
 *   # Joiner (other terminal)
 *   pnpm agent --role atlas --dispute-id <id> --token <atlas_token>
 *
 *   # MCP URL (default = prod)
 *   --mcp-url https://platanus-hack-26-ar-team-5.vercel.app/api/mcp
 *
 * The two CLIs talk to EACH OTHER through Pacta MCP — they never call each other
 * directly. Pacta is the only shared state.
 */
import Anthropic from "@anthropic-ai/sdk";
import pc from "picocolors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadEnv } from "../src/env.js";
import { TOOLS } from "../src/prompts.js";
import { getScenario } from "../src/scenarios/index.js";
import { MODELS } from "../src/anthropic.js";

loadEnv();

type Args = {
  role: "aria" | "atlas";
  open?: string;
  dispute_id?: string;
  mcp_url: string;
  poll_ms: number;
  max_turns: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === `--${name}` || argv[i] === `-${name[0]}`) return argv[i + 1];
      if (argv[i]!.startsWith(`--${name}=`)) return argv[i]!.split("=", 2)[1];
    }
    return undefined;
  };
  const role = (get("role") ?? "aria") as "aria" | "atlas";
  return {
    role,
    open: get("open"),
    dispute_id: get("dispute-id") ?? get("dispute"),
    mcp_url:
      get("mcp-url") ??
      process.env.PACTA_MCP_URL ??
      "https://platanus-hack-26-ar-team-5.vercel.app/api/mcp",
    poll_ms: Number(get("poll-ms") ?? "3000"),
    max_turns: Number(get("max-turns") ?? "10"),
  };
}

type CallResult = { isError?: boolean; content?: Array<{ type: string; text?: string }> };
function textOf(r: CallResult): string {
  return ((r.content as Array<{ type: string; text?: string }> | undefined)?.[0]?.text) ?? "";
}
function extractJson(text: string, marker: string): unknown {
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  const after = text.slice(idx + marker.length).trimStart();
  const start = after.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < after.length; i++) {
    const c = after[i]!;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(after.slice(start, i + 1));
    }
  }
  return null;
}

const tag = (role: "aria" | "atlas") => (role === "aria" ? pc.cyan(`[${role}]`) : pc.magenta(`[${role}]`));

async function main() {
  const args = parseArgs();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(pc.red("ANTHROPIC_API_KEY not set."));
    process.exit(2);
  }

  const log = (...parts: unknown[]) => console.log(tag(args.role), ...parts);

  log(pc.bold("⚖ Pacta external agent starting"));
  log(pc.gray("MCP URL:"), args.mcp_url);

  // Connect MCP client
  const transport = new StreamableHTTPClientTransport(new URL(args.mcp_url));
  const client = new Client({ name: `pacta-agent-${args.role}`, version: "0.1.0" });
  await client.connect(transport);

  type DisputeBootstrap = {
    dispute_id: string;
    scenario_id: string;
    your_did: string;
    counterparty_did: string;
    your_token: string;
    counterparty_token?: string;
    evidence_summary: Array<{ id: string; tier: string; submitter: string; hash: string }>;
  };

  let boot: DisputeBootstrap;

  if (args.open) {
    log(pc.yellow(`Opening new dispute: scenario=${args.open}, role=${args.role}, counterparty_external=true`));
    const r = (await client.callTool({
      name: "open_dispute",
      arguments: {
        scenario_id: args.open,
        your_role: args.role,
        counterparty_external: true,
      },
    })) as CallResult;
    if (r.isError) throw new Error("open_dispute: " + textOf(r));
    const details = extractJson(textOf(r), "--- DETAILS ---") as DisputeBootstrap;
    boot = details;
    log(pc.green(`✓ dispute_id     :`), boot.dispute_id);
    log(pc.green(`✓ your_did       :`), boot.your_did);
    log(pc.green(`✓ counterparty   :`), boot.counterparty_did);
    log("");
    log(pc.bold(pc.yellow("→ Share this dispute_id with the peer agent (no token needed):")));
    log(
      pc.bold(
        `   pnpm agent --role ${args.role === "aria" ? "atlas" : "aria"}` +
          ` --dispute-id ${boot.dispute_id}`,
      ),
    );
    log("");
  } else {
    if (!args.dispute_id) {
      console.error(pc.red("missing --dispute-id (or use --open <scenario>)"));
      process.exit(2);
    }
    log(pc.yellow(`Joining existing dispute ${args.dispute_id} as ${args.role}`));
    const r = (await client.callTool({
      name: "join_dispute",
      arguments: { dispute_id: args.dispute_id, role: args.role },
    })) as CallResult;
    if (r.isError) throw new Error("join_dispute: " + textOf(r));
    const details = extractJson(textOf(r), "--- DETAILS ---") as DisputeBootstrap;
    boot = details;
    log(pc.green(`✓ joined`));
    log(pc.green(`✓ your_did     :`), boot.your_did);
    log(pc.green(`✓ counterparty :`), boot.counterparty_did);
    log("");
  }

  const scenario = getScenario(boot.scenario_id);
  const sysPrompt = scenario.agents[args.role].system_prompt;
  log(pc.gray(`scenario: ${scenario.name}`));
  log(pc.gray(`role: ${args.role} (${scenario.agents[args.role].display_name})`));
  log("");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  let turnCount = 0;

  // Main loop: poll → if my turn, generate via Claude and submit → loop.
  while (turnCount < args.max_turns) {
    // Fetch state
    const sr = (await client.callTool({
      name: "get_dispute",
      arguments: { dispute_id: boot.dispute_id },
    })) as CallResult;
    if (sr.isError) throw new Error("get_dispute: " + textOf(sr));
    const dump = JSON.parse(textOf(sr)) as {
      turn: "aria" | "atlas";
      current_round: number;
      finalized: { type: string; outcome: { kind: string; final_state?: { credit_usd: number; terms: string } } } | null;
      ruling: { ruling: { outcome: string; remedy: { credit_usd: number; terms: string } } } | null;
      history: Array<{
        type: string;
        round: number;
        from_agent: string;
        evidence_refs: string[];
        parent_refs: string[];
        payload: unknown;
        proof: unknown;
      }>;
      evidence: Array<{ evidence_id: string; submitter: string; tier: string; proof: unknown }>;
      pending_feedback: string[];
    };

    if (dump.finalized) {
      log(pc.bold(pc.green("✅ Dispute finalized.")));
      log(`   outcome.kind: ${dump.finalized.outcome.kind}`);
      if (dump.finalized.outcome.final_state) {
        log(`   final_state:  ${JSON.stringify(dump.finalized.outcome.final_state)}`);
      } else if (dump.ruling) {
        log(`   ruling:       ${dump.ruling.ruling.outcome}`);
        log(`   remedy:       ${JSON.stringify(dump.ruling.ruling.remedy)}`);
      }
      break;
    }

    if (dump.turn !== args.role) {
      log(
        pc.gray(
          `R${dump.current_round}: waiting for ${dump.turn} (history=${dump.history.length})…`,
        ),
      );
      await new Promise((r) => setTimeout(r, args.poll_ms));
      continue;
    }

    // It's my turn.
    turnCount++;
    log(pc.yellow(`R${dump.current_round} my turn (#${turnCount})`));

    // Compute evidence hashes if we don't have them yet
    const { docHash } = await import("../src/sign.js");
    const evidenceHashes = new Map<string, string>();
    const ownEv: Array<{ id: string; tier: string; hash: string; body: string; title: string }> = [];
    const otherEv: Array<{ id: string; tier: string; hash: string; body: string; title: string }> = [];
    for (const e of dump.evidence as unknown as Array<Parameters<typeof docHash>[0] & {
      evidence_id: string;
      submitter: string;
      tier: string;
      title: string;
      body: string;
    }>) {
      const h = docHash(e);
      evidenceHashes.set(e.evidence_id, h);
      const item = { id: e.evidence_id, tier: e.tier, hash: h, body: e.body, title: e.title };
      if (e.submitter === boot.your_did) ownEv.push(item);
      else otherEv.push(item);
    }

    const historyText =
      dump.history.length === 0
        ? "(none — you open the negotiation)"
        : dump.history
            .map((m, i) => {
              const h = docHash(m as unknown as Parameters<typeof docHash>[0]);
              return [
                `[${i + 1}] ${m.type}  hash: ${h}`,
                `    from: ${m.from_agent}  round: ${m.round}`,
                `    evidence_refs: ${JSON.stringify(m.evidence_refs)}`,
                `    parent_refs:   ${JSON.stringify(m.parent_refs)}`,
                `    payload: ${JSON.stringify(m.payload)}`,
              ].join("\n");
            })
            .join("\n\n");

    const evCatalog = (lst: typeof ownEv) =>
      lst
        .map((e) =>
          [
            `- evidence_id: ${e.id}`,
            `  hash: ${e.hash}`,
            `  tier: ${e.tier}`,
            `  title: ${e.title}`,
            `  body: ${e.body}`,
          ].join("\n"),
        )
        .join("\n\n");

    const userPrompt = [
      `## Round ${dump.current_round}. It is your turn (${scenario.agents[args.role].display_name}).`,
      ``,
      `## Case`,
      scenario.case_summary,
      ``,
      `## Your DID`,
      boot.your_did,
      ``,
      `## Your evidence`,
      evCatalog(ownEv),
      ``,
      `## Counterparty evidence`,
      evCatalog(otherEv),
      ``,
      `## Message history`,
      historyText,
      ``,
      ...(dump.pending_feedback.length > 0
        ? [
            `## ⚠ Your previous attempt(s) this turn were REJECTED:`,
            ...dump.pending_feedback.map((r) => `- ${r}`),
            ``,
          ]
        : []),
      `## Instruction`,
      `Emit exactly one Pacta message via a tool call. Pick the most strategic primitive.`,
      `Compromise bound: utility_for_self ≤ your previous. Reveal monotonicity. Cite real sha256 hashes.`,
    ].join("\n");

    const resp = await anthropic.messages.create({
      model: MODELS.negotiator,
      max_tokens: 1500,
      system: sysPrompt,
      tools: TOOLS as unknown as Anthropic.Tool[],
      tool_choice: { type: "any", disable_parallel_tool_use: true },
      messages: [{ role: "user", content: userPrompt }],
    });

    let toolBlock: { name: string; input: Record<string, unknown> } | null = null;
    for (const block of resp.content) {
      if (block.type === "tool_use") {
        toolBlock = { name: block.name, input: block.input as Record<string, unknown> };
        break;
      }
    }
    if (!toolBlock) {
      log(pc.red("LLM did not emit a tool call; aborting."));
      break;
    }

    const tname = toolBlock.name;
    const inp = toolBlock.input;
    const evidence_refs = (inp.evidence_refs as string[]) ?? [];
    const parent_refs = (inp.parent_refs as string[]) ?? [];
    let message: Record<string, unknown>;
    if (tname === "propose" || tname === "counter_propose") {
      message = {
        type: tname === "propose" ? "Propose" : "CounterPropose",
        round: dump.current_round,
        from_agent: boot.your_did,
        evidence_refs,
        parent_refs,
        payload: {
          state: inp.state,
          rationale: inp.rationale,
          utility_for_self: inp.utility_for_self,
        },
      };
    } else if (tname === "critique") {
      message = {
        type: "Critique",
        round: dump.current_round,
        from_agent: boot.your_did,
        evidence_refs,
        parent_refs,
        payload: { target_msg_hash: inp.target_msg_hash, rationale: inp.rationale },
      };
    } else if (tname === "accept") {
      message = {
        type: "Accept",
        round: dump.current_round,
        from_agent: boot.your_did,
        evidence_refs,
        parent_refs,
        payload: { target_msg_hash: inp.target_msg_hash },
      };
    } else if (tname === "reveal") {
      message = {
        type: "Reveal",
        round: dump.current_round,
        from_agent: boot.your_did,
        evidence_refs,
        parent_refs,
        payload: { domain: inp.domain, information: inp.information },
      };
    } else {
      message = {
        type: "Escalate",
        round: dump.current_round,
        from_agent: boot.your_did,
        evidence_refs,
        parent_refs,
        payload: { reason: inp.reason, requested_action: inp.requested_action },
      };
    }

    log(pc.cyan(`→ submit ${message.type}`));
    if (message.type === "Propose" || message.type === "CounterPropose") {
      const p = message.payload as { state: { credit_usd: number; terms: string }; utility_for_self: number };
      log(pc.gray(`  state: ${JSON.stringify(p.state)}  util ${p.utility_for_self}`));
    } else if (message.type === "Reveal") {
      const p = message.payload as { domain: string; information: string };
      log(pc.gray(`  domain: ${p.domain} → ${String(p.information).slice(0, 80)}`));
    } else if (message.type === "Accept") {
      const p = message.payload as { target_msg_hash: string };
      log(pc.gray(`  accepts: ${p.target_msg_hash.slice(0, 22)}…`));
    }

    const sub = (await client.callTool({
      name: "submit_message",
      arguments: { dispute_id: boot.dispute_id, role_token: boot.your_token, message },
    })) as CallResult;
    if (sub.isError) {
      log(pc.red(`submit error: ${textOf(sub).slice(0, 160)}`));
    } else {
      // Print a brief tally of events
      const t = textOf(sub);
      const eventsBlock = t.match(/--- EVENTS ---\n([\s\S]*?)\n\n--- STATE/);
      if (eventsBlock) {
        const lines = eventsBlock[1]!.split("\n");
        for (const line of lines) {
          try {
            const ev = JSON.parse(line);
            if (ev.kind === "message.accepted")
              log(pc.green(`  ✓ ${ev.role} accepted`));
            else if (ev.kind === "message.rejected")
              log(pc.red(`  ✗ rejected: ${ev.reason}`));
            else if (ev.kind === "convergence")
              log(pc.bold(pc.green(`  ✅ CONVERGED → ${JSON.stringify(ev.final_state)}`)));
            else if (ev.kind === "escalation")
              log(pc.yellow(`  ↗ escalation: ${ev.reason}`));
            else if (ev.kind === "jury.ruled")
              log(pc.yellow(`  ⚖ jury ruled`));
          } catch {}
        }
      }
    }
  }

  await client.close();
  log(pc.bold("agent done"));
}

main().catch((err) => {
  console.error("agent failed:", err);
  process.exit(1);
});
