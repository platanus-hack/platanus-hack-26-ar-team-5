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
import {
  openDispute,
  joinDispute,
  getDispute,
  dumpDispute,
  submitEvidence,
} from "./dispute_store.js";
import { submitExternalMessage, advanceClaudeTurns, publicState } from "./dispute_engine.js";
import type { Bundle } from "./types.js";
import type { MessageBody } from "./orchestrator.js";

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

  // ----- Phase 2: open_dispute ----------------------------------------------
  server.registerTool(
    "open_dispute",
    {
      description:
        "Open a Pacta dispute. Two modes:\n" +
        "  • SCHEMA-LESS (real BYO): pass `claim` describing what's being disputed. " +
        "Pacta gives you the protocol (signed messages, compromise bound, jury, audit " +
        "trail). You and the counterparty bring your own positions, prompts, and " +
        "evidence (use submit_evidence). Roles 'aria' and 'atlas' are abstract " +
        "labels — what they MEAN comes from your claim and your messages.\n" +
        "  • TEMPLATE (demo): pass `scenario_id` to load one of the bundled cases " +
        "(ai-overrun, oncology, cve-disclosure, creative-brief, deadlock-leak, " +
        "deadlock-fairuse). The pool comes pre-loaded with that scenario's evidence.\n\n" +
        "Returns dispute_id, your role token, your DID, the counterparty DID, the " +
        "(initially empty for schema-less) evidence pool, and who acts next.",
      inputSchema: {
        claim: z
          .string()
          .optional()
          .describe(
            "Free-form description of what's being disputed. Required when scenario_id is absent. Example: 'Vendor A delivered our X feature 3 weeks late, claiming Z. We invoke the SLA penalty clause.'",
          ),
        scenario_id: z
          .string()
          .optional()
          .describe("Optional bundled scenario template id."),
        your_role: z
          .enum(["aria", "atlas"])
          .describe(
            "Which role you will play. 'aria' and 'atlas' are abstract labels for the two parties — define what they mean in your claim.",
          ),
        counterparty_external: z
          .boolean()
          .optional()
          .describe(
            "If true (REQUIRED for schema-less), the OTHER side must also be a real external agent. If false (default), Pacta drives the other side with Claude — only valid when scenario_id is provided (the scenario carries the system prompt).",
          ),
      },
    },
    async ({ claim, scenario_id, your_role, counterparty_external }) => {
      try {
        const result = await openDispute({
          claim,
          scenario_id,
          your_role,
          counterparty_external: counterparty_external === true,
        });
        return {
          content: [
            {
              type: "text",
              text:
                `Dispute opened.\n` +
                `  dispute_id:           ${result.dispute_id}\n` +
                `  scenario:             ${result.scenario?.name ?? "(schema-less / claim provided)"}\n` +
                `  claim:                ${result.claim ?? "(none)"}\n` +
                `  your_role:            ${result.your_role}\n` +
                `  your_did:             ${result.your_did}\n` +
                `  your_token:           ${result.your_token}\n` +
                `  counterparty_did:     ${result.counterparty_did}\n` +
                `  counterparty_external: ${result.counterparty_external}\n` +
                `  next_to_act:          ${result.next_to_act}\n` +
                `  current_round:        ${result.current_round}\n\n` +
                `--- DETAILS ---\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
      }
    },
  );

  // ----- Phase 2: join_dispute ----------------------------------------------
  server.registerTool(
    "join_dispute",
    {
      description:
        "Join an existing Pacta dispute as the second external agent. First-come-first-served per " +
        "role. Returns your role_token, your DID, the counterparty DID, and the evidence pool. " +
        "Use this when you receive a dispute_id from a peer who already called open_dispute. " +
        "After this call, you can submit_message as your role.",
      inputSchema: {
        dispute_id: z.string(),
        role: z
          .enum(["aria", "atlas"])
          .describe("The role you want to claim. Must be the externally-controlled role still unclaimed in this dispute."),
      },
    },
    async ({ dispute_id, role }) => {
      try {
        const r = await joinDispute({ dispute_id, role });
        return {
          content: [
            {
              type: "text",
              text:
                `Joined dispute.\n` +
                `  dispute_id:        ${r.dispute_id}\n` +
                `  scenario:          ${r.scenario?.name ?? "(schema-less)"}\n` +
                `  claim:             ${r.claim ?? "(none)"}\n` +
                `  your_role:         ${r.your_role}\n` +
                `  your_did:          ${r.your_did}\n` +
                `  your_token:        ${r.your_token}\n` +
                `  counterparty_did:  ${r.counterparty_did}\n` +
                `  next_to_act:       ${r.next_to_act}\n` +
                `  current_round:     ${r.current_round}\n\n` +
                `--- DETAILS ---\n${JSON.stringify(r, null, 2)}`,
            },
          ],
        };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
      }
    },
  );

  // ----- Phase 2: submit_evidence -------------------------------------------
  server.registerTool(
    "submit_evidence",
    {
      description:
        "Append a piece of signed evidence to an open dispute. Either party can submit " +
        "evidence at any time (it isn't bound to a turn). Pacta signs the evidence with " +
        "your role's keypair so the audit trail records who submitted it. Returns the " +
        "evidence_id and sha256 hash you'll use in subsequent submit_message calls' " +
        "evidence_refs. For SCHEMA-LESS disputes, this is how you bring your own " +
        "evidence in. For TEMPLATE disputes, it's an additive surface on top of the " +
        "pre-loaded scenario pool.",
      inputSchema: {
        dispute_id: z.string(),
        role_token: z.string(),
        evidence: z
          .object({
            tier: z
              .enum(["S", "A", "B", "C"])
              .describe(
                "Evidence tier. S = cryptographically self-verifiable (signed contract, on-chain tx). " +
                  "A = third-party verifiable (public paper, public changelog, attested log). " +
                  "B = self-emitted internal document — weighted less by the jury. " +
                  "C = pure argumentation / interpretation.",
              ),
            title: z.string(),
            body: z.string().describe("The actual content / summary of the evidence."),
            evidence_id: z
              .string()
              .optional()
              .describe("Optional stable id. Pacta generates one if you don't provide it."),
          }),
      },
    },
    async ({ dispute_id, role_token, evidence }) => {
      try {
        const r = await submitEvidence({ dispute_id, role_token, evidence });
        return {
          content: [
            {
              type: "text",
              text:
                `Evidence appended.\n` +
                `  evidence_id: ${r.evidence_id}\n` +
                `  hash:        ${r.hash}\n` +
                `  submitter:   ${r.signed.submitter}\n` +
                `  tier:        ${r.signed.tier}\n` +
                `Use this hash in future submit_message evidence_refs.`,
            },
          ],
        };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
      }
    },
  );

  // ----- Phase 2: submit_message --------------------------------------------
  server.registerTool(
    "submit_message",
    {
      description:
        "Submit a Pacta message (Propose / Critique / CounterPropose / Accept / Reveal / Escalate) " +
        "for the role you opened the dispute as. The orchestrator validates the message " +
        "against ALL protocol rules: from_agent must match your role's DID; round must match " +
        "the current round; evidence_refs and parent_refs must be exact sha256:... hashes from " +
        "the dispute's pool/history; compromise bound (utility_for_self ≤ your previous); " +
        "reveal monotonicity (each domain only once); Accept must target a real prior " +
        "Propose/CounterPropose hash. If Pacta is driving the counterparty, Pacta will then " +
        "run the counterparty's turn(s) before yielding back. The response includes events from " +
        "your message and any Claude turns that ran, plus the public dispute state.",
      inputSchema: {
        dispute_id: z.string(),
        role_token: z.string().describe("The token returned by open_dispute for your role."),
        message: z
          .object({
            type: z.enum([
              "Propose",
              "Critique",
              "CounterPropose",
              "Accept",
              "Reveal",
              "Escalate",
            ]),
            round: z.number().int().describe("Must match the dispute's current_round."),
            from_agent: z
              .string()
              .describe("Must equal your_did from open_dispute (a did:key:... DID)."),
            evidence_refs: z
              .array(z.string())
              .describe("List of sha256:... hashes of evidence items from the pool. Empty if none."),
            parent_refs: z
              .array(z.string())
              .describe("List of sha256:... hashes of prior messages in history. Empty if none."),
            payload: z
              .record(z.string(), z.unknown())
              .describe(
                "Per-message-type payload. " +
                  "Propose/CounterPropose: { state: {credit_usd, terms}, rationale, utility_for_self }. " +
                  "Critique: { target_msg_hash, rationale }. " +
                  "Accept: { target_msg_hash }. " +
                  "Reveal: { domain, information }. " +
                  "Escalate: { reason, requested_action }.",
              ),
          })
          .describe("The message body to submit. msg_id and timestamp are filled by Pacta."),
      },
    },
    async ({ dispute_id, role_token, message }) => {
      try {
        const body = message as unknown as MessageBody;
        const { events, state } = await submitExternalMessage({
          dispute_id,
          role_token,
          body,
        });
        return {
          content: [
            {
              type: "text",
              text:
                `submit_message processed.\n\n` +
                `--- EVENTS ---\n${events.map((e) => JSON.stringify(e)).join("\n")}\n\n` +
                `--- STATE ---\n${JSON.stringify(state, null, 2)}`,
            },
          ],
        };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
      }
    },
  );

  // ----- Phase 2: get_dispute -----------------------------------------------
  server.registerTool(
    "get_dispute",
    {
      description:
        "Fetch the current state of a dispute: turn, round, full signed history, evidence pool, " +
        "any pending rejection feedback for the next attempt, and the finalized bundle if the " +
        "dispute has converged or been ruled. Useful for polling whose turn is next.",
      inputSchema: {
        dispute_id: z.string(),
      },
    },
    async ({ dispute_id }) => {
      try {
        const dump = await dumpDispute(dispute_id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(dump, null, 2),
            },
          ],
        };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
      }
    },
  );

  return server;
}
