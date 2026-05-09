/**
 * Pacta MCP server: exposes the protocol as Model Context Protocol tools so
 * external agents (Claude Desktop, Claude Code, custom MCP clients) can invoke
 * disputes, run negotiations, and verify bundles.
 *
 * Phase 1 tools (stateless):
 *   - pacta_list_scenarios
 *   - pacta_run_scenario
 *   - pacta_verify_bundle
 *
 * Phase 2 tools (BYO-agent, stateful via globalThis store):
 *   - pacta_open_dispute
 *   - pacta_submit_message
 *   - pacta_get_dispute
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runPacta, listScenarios, getScenario } from "./pacta.js";
import { verifySignedDoc, docHash } from "./sign.js";
import { hash as hashOf } from "./canonical.js";
import type { Bundle } from "./types.js";

export function buildPactaMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "pacta",
      version: "0.1.0",
    },
    {
      instructions:
        "Pacta — trust protocol for AI agents in dispute. Use these tools to run a Pacta " +
        "deliberation between two agents and verify the resulting cryptographic audit trail. " +
        "Every message is signed Ed25519 over RFC 8785 canonical JSON; every bundle is " +
        "content-addressed and externally verifiable.",
    },
  );

  // ----- Phase 1: list_scenarios --------------------------------------------
  server.registerTool(
    "list_scenarios",
    {
      description:
        "List the bundled Pacta scenarios available for run_scenario. Each entry has an id, " +
        "name, and one-line description.",
      inputSchema: {},
    },
    async () => {
      const scenarios = listScenarios();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ scenarios }, null, 2),
          },
        ],
      };
    },
  );

  // ----- Phase 1: run_scenario ----------------------------------------------
  server.registerTool(
    "run_scenario",
    {
      description:
        "Run a Pacta dispute end-to-end on one of the bundled scenarios. Two LLM agents " +
        "alternate Propose/Critique/CounterPropose/Reveal/Accept under compromise-bound and " +
        "reveal-monotonicity enforcement. If they cannot converge in 5 rounds, a heterogeneous " +
        "Tribunal jury (3 Claude models with fairness/efficiency/speed biases) deliberates. " +
        "Returns the full signed Bundle (evidence, messages, ruling if any, root_hash). " +
        "When `mock` is true, runs a deterministic offline replay (no LLM calls; ~1s).",
      inputSchema: {
        scenario_id: z
          .string()
          .describe(
            "One of: ai-overrun, oncology, cve-disclosure, creative-brief, deadlock-leak, deadlock-fairuse",
          ),
        mock: z
          .boolean()
          .optional()
          .describe(
            "If true, use deterministic mock driver instead of live LLMs. Defaults to false (live).",
          ),
      },
    },
    async ({ scenario_id, mock }) => {
      // Validate up-front so we surface a clean error instead of streaming partial state.
      try {
        getScenario(scenario_id);
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: (err as Error).message }],
        };
      }
      let bundle: Bundle | null = null;
      const events: string[] = [];
      for await (const ev of runPacta({ scenario: scenario_id, mock: mock === true })) {
        if (ev.kind === "bundle") {
          bundle = ev.bundle;
        }
        // Capture summary line per event for the agent to narrate the negotiation.
        events.push(JSON.stringify(ev));
      }
      if (!bundle) {
        return {
          isError: true,
          content: [{ type: "text", text: "Pacta returned no bundle" }],
        };
      }
      return {
        content: [
          {
            type: "text",
            text:
              `Pacta dispute completed.\n` +
              `  scenario:      ${bundle.scenario}\n` +
              `  outcome.kind:  ${bundle.outcome.kind}\n` +
              `  messages:      ${bundle.messages.length}\n` +
              `  evidence:      ${bundle.evidence.length}\n` +
              `  root_hash:     ${bundle.root_hash}\n\n` +
              `--- BUNDLE ---\n${JSON.stringify(bundle, null, 2)}\n\n` +
              `--- EVENT TIMELINE (NDJSON) ---\n${events.join("\n")}`,
          },
        ],
      };
    },
  );

  // ----- Phase 1: verify_bundle ---------------------------------------------
  server.registerTool(
    "verify_bundle",
    {
      description:
        "Verify a Pacta Bundle independently. Recomputes Ed25519 signatures over RFC 8785 " +
        "canonical bytes for every signed evidence + message + vote + ruling, and checks the " +
        "bundle root_hash. Returns a per-document pass/fail report.",
      inputSchema: {
        bundle: z
          .unknown()
          .describe("A Pacta Bundle JSON object — typically the output of run_scenario."),
      },
    },
    async ({ bundle }) => {
      const b = bundle as Bundle;
      const checks: Array<{ label: string; ok: boolean }> = [];
      for (const e of b.evidence ?? []) {
        checks.push({ label: `evidence ${e.evidence_id}`, ok: verifySignedDoc(e) });
      }
      for (const m of b.messages ?? []) {
        checks.push({
          label: `message ${m.type} ${docHash(m).slice(0, 18)}`,
          ok: verifySignedDoc(m),
        });
      }
      if (b.outcome && b.outcome.kind === "ruling") {
        for (const v of b.outcome.votes) {
          checks.push({ label: `vote ${v.juror}`, ok: verifySignedDoc(v) });
        }
        checks.push({ label: "ruling", ok: verifySignedDoc(b.outcome.ruling) });
      }
      const { root_hash, ...rest } = b;
      const recomputed = hashOf(rest);
      const rootOk = recomputed === root_hash;
      checks.push({ label: "root_hash", ok: rootOk });
      const failures = checks.filter((c) => !c.ok);
      const lines = [
        ...checks.map((c) => `  ${c.ok ? "✓" : "✗"} ${c.label}`),
        "",
        failures.length === 0
          ? `All ${checks.length} checks passed.`
          : `${failures.length} check(s) failed.`,
      ];
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        isError: failures.length > 0,
      };
    },
  );

  return server;
}
