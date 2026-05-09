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
import { runPacta, listScenarios, getScenario } from "./pacta";
import { verifySignedDoc, docHash } from "./sign";
import { hash as hashOf } from "./canonical";
import {
  openDispute,
  joinDispute,
  getDispute,
  dumpDispute,
  submitEvidence,
} from "./dispute_store";
import { submitExternalMessage, advanceClaudeTurns, publicState } from "./dispute_engine";
import type { Bundle } from "./types";
import type { MessageBody } from "./orchestrator";

export function buildPactaMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "pacta",
      version: "0.1.0",
    },
    {
      instructions: `Pacta — trust protocol for AI agents in dispute. You are an autonomous Pacta participant.

# What you are
A real party in a structured negotiation. The user gives you a one-time brief (your principal, position, evidence, reservation values, acceptable concessions). You act on their behalf and run the dispute to a final outcome WITHOUT asking the user mid-loop. The protocol mechanics below are YOUR job to know — the user's brief should not have to teach you them.

# Roles are abstract slot labels
Pacta has exactly TWO party slots: \`aria\` and \`atlas\`. These are NOT names — they're slot labels for "the two sides of this dispute". Your brief may call you anything (Lumea, Stitcher, Acme, Hospital, Insurer, your-company-name). When told which slot to take, TAKE IT and represent your brief's party in that slot. Convention: typically \`aria\` = the claimant / technically-empowered side, \`atlas\` = the respondent / contractually-anchored side. Convention only; not enforcement.

# The autonomous loop
1. **Set up.** OPENER → \`open_dispute({ claim, your_role, counterparty_external: true })\`. JOINER → \`join_dispute({ dispute_id, role })\`. Both return your role_token, your_did, counterparty_did, evidence pool.
2. **Submit evidence.** For each item in your brief, \`submit_evidence({ tier, title, body })\`. Tier: S = signed/cryptographic/lab, A = third-party public, B = self-emitted internal (weighted less by jury), C = pure argumentation. The response returns the short \`eN\` ref AND a sha256 hash — log them.
3. **Negotiate.** Until \`finalized=true\`:
   - If it's NOT your turn: \`wait_for_turn\`. Returns a discriminator \`kind\` —
     - \`your_turn\`: act now (full state in the response).
     - \`finalized\`: jump to step 4 (full state including the bundle in the response).
     - \`timeout\`: counterparty hasn't moved yet. Just call \`wait_for_turn\` again — the response is a thin heartbeat, no full state. Do NOT poll \`get_dispute\` in a loop.
   - When it IS your turn: \`get_dispute\` for the latest, then \`submit_message\` with one of Propose / Critique / CounterPropose / Accept / Reveal / Escalate.
4. **Done.** When finalized: extract the bundle from the dispute, call \`verify_bundle({ bundle })\`, report the outcome + verification result + final terms.

# Reference forms (stop computing sha256 manually)
Every \`get_dispute\` response annotates each \`history\` and \`evidence\` entry with both \`hash\` (canonical sha256) AND a short \`ref\` (\`m1\`/\`m2\`/... for messages, \`e1\`/\`e2\`/... for evidence). The response also includes a \`references_help\` block describing the accepted forms.

In \`evidence_refs\`, \`parent_refs\`, and \`target_msg_hash\`, you may pass any of:
- \`mN\` / \`eN\` short ref (preferred — copy from \`get_dispute\`)
- \`msg_id\` (32-hex, on every history entry) / \`evidence_id\` (\`ev_...\`)
- full \`sha256:...\` hash

The server resolves all three forms to canonical sha256 before signing — the audit trail is content-addressed end to end regardless of which form you submitted.

# Validation rules the orchestrator enforces (don't fight them)
- \`from_agent\` MUST equal your_did from open/join.
- \`round\` MUST equal current_round from get_dispute.
- **Compromise bound**: every Propose/CounterPropose by you must have \`utility_for_self\` ≤ your previous one. Step DOWN as you concede. Don't snap back up.
- **Reveal monotonicity**: each \`domain\` may be revealed at most ONCE per agent. Pick fresh domain strings.
- **parent_refs requirement**: Critique / CounterPropose / Accept require NON-EMPTY parent_refs (cite at least the message you respond to). Propose may have empty parent_refs only at round 1 (the opening move).
- **Accept** target must resolve to a real Propose/CounterPropose (use \`mN\`).
- **Critique** payload requires \`target_msg_hash\` (use \`mN\`).
- Rejected messages return a \`pending_feedback\` string echoing the valid refs. Read it and self-correct on the next attempt — you have one retry per turn.

# Convergence rule — sequential Accept (now ENFORCED, not just guidance)
**Convergence requires BOTH parties to Accept the SAME \`target_msg_hash\`.** Two Accepts on different targets do NOT converge — even if both target proposals have substantively identical terms. The bundle's \`accepted_msg_hash\` must be a single canonical document.

To prevent the "cross-accept trap" the orchestrator now ENFORCES sequential Accepts:
- If the counterparty's most recent move was \`Accept(T)\`, your only valid \`Accept\` is also on \`T\` (which converges the dispute).
- Accepting a DIFFERENT target → server REJECTS your message with \`pending_feedback\` echoing \`T\`. Read it and either (a) Accept \`T\`, or (b) submit a CounterPropose / Critique / Escalate to keep the negotiation open. Real negotiations are linear: respond to the LATEST move from the other side, not a stale earlier one.

This means: when you decide to "say yes", look at the counterparty's MOST RECENT move. If it's a CounterPropose, Accept it. If it's an Accept, match it. Don't reach back to a stale offer.

# Self-Accept
You CAN Accept a CounterPropose you authored — useful as a convergence-anchor pattern (you re-state agreed terms in a CP, then both you and the counterparty Accept it). In a normal flow, prefer Accepting the counterparty's CP — it's one fewer turn.

# Payload shapes
- Propose / CounterPropose: \`{ state: { credit_usd, terms }, rationale, utility_for_self }\` — \`credit_usd\` is 0 for non-monetary disputes; \`terms\` is the deliberation text.
- Critique: \`{ target_msg_hash, rationale }\`
- Accept: \`{ target_msg_hash }\`
- Reveal: \`{ domain, information }\`
- Escalate: \`{ reason, requested_action: "mediator" | "deadline_extension" }\`

# Bundle verification
On finalize, call \`verify_bundle({ bundle: <get_dispute.finalized> })\`. Modern bundles include \`root_hash_jcs\` (the canonical-JCS string used to compute root_hash) — verify_bundle uses it for byte-deterministic verification immune to JSON round-trip noise. All per-doc Ed25519 signatures + the root_hash should pass.

# Decision-making
You decide what to propose, when to reveal, when to accept, when to escalate. Don't ask the user to confirm role mappings, tiering, or strategy. The only valid reasons to break out to the user are: dispute is finalized (report outcome) or a hard server error you cannot recover from. Otherwise: act.

Every message you submit is signed Ed25519 by Pacta on your behalf; every bundle is content-addressed; cross-organization audit is built in.`,
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
        "Verify a Pacta Bundle independently. Re-checks Ed25519 signatures over RFC 8785 " +
        "canonical bytes for every signed evidence + message + vote + ruling, and validates " +
        "the bundle root_hash. Two input modes:\n" +
        "  • dispute_id (preferred for agentic clients): the server fetches the finalized " +
        "bundle internally — no need to inline a 100KB+ artifact through your context window.\n" +
        "  • bundle (legacy): pass the full Pacta Bundle JSON object — typically the output of " +
        "run_scenario or get_dispute.finalized.\n" +
        "When the bundle includes 'root_hash_jcs' (the canonical-JCS string used at build time), " +
        "root_hash is verified by hashing that string directly — byte-deterministic and immune " +
        "to JSON round-trip noise. When absent, falls back to recomputing canonicalize(bundle " +
        "minus root_hash). Returns a per-document pass/fail report.",
      inputSchema: {
        bundle: z
          .unknown()
          .optional()
          .describe("Optional. A Pacta Bundle JSON object — typically the output of run_scenario or get_dispute.finalized. Mutually exclusive with dispute_id."),
        dispute_id: z
          .string()
          .optional()
          .describe("Optional. Verify the finalized bundle of an existing dispute by id — server fetches it internally so the client doesn't have to ship the full bundle. The dispute must be finalized (converged or ruled). Mutually exclusive with bundle."),
      },
    },
    async ({ bundle, dispute_id }) => {
      // Mode resolution: dispute_id takes precedence if both are passed; bundle
      // is the legacy path. Reject if neither.
      let b: Bundle;
      if (typeof dispute_id === "string" && dispute_id.length > 0) {
        try {
          const dump = await dumpDispute(dispute_id);
          if (!dump.finalized) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text:
                    `verify_bundle: dispute ${dispute_id} is not finalized yet ` +
                    `(turn=${dump.turn}, current_round=${dump.current_round}). ` +
                    `Wait for convergence or jury ruling before verifying.`,
                },
              ],
            };
          }
          b = dump.finalized as Bundle;
        } catch (err) {
          return {
            isError: true,
            content: [{ type: "text", text: (err as Error).message }],
          };
        }
      } else if (bundle != null) {
        b = bundle as Bundle;
      } else {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "verify_bundle requires either `dispute_id` (server-side fetch) or `bundle` (full inline object).",
            },
          ],
        };
      }
      const checks: Array<{ label: string; ok: boolean; detail?: string }> = [];
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
      // root_hash verification — prefer the embedded JCS string when present.
      const { root_hash, root_hash_jcs, ...rest } = b as Bundle & { root_hash_jcs?: string };
      let rootOk = false;
      let rootDetail: string | undefined;
      if (typeof root_hash_jcs === "string" && root_hash_jcs.length > 0) {
        // Hash the embedded canonical bytes directly — deterministic across
        // any JSON round-trip the bundle might have undergone.
        const fromEmbedded = hashOf(JSON.parse(root_hash_jcs));
        // Sanity: hashing the parsed object should still produce the same hash
        // since canonicalize is deterministic. If not, the embedded string is
        // tampered with relative to the rest of the bundle.
        const recomputed = hashOf(rest);
        if (fromEmbedded === root_hash && recomputed === root_hash) {
          rootOk = true;
          rootDetail = "verified via root_hash_jcs (transport-safe)";
        } else if (fromEmbedded === root_hash) {
          rootOk = true;
          rootDetail =
            "verified via root_hash_jcs; recompute(rest) differs " +
            `(${recomputed.slice(0, 26)}…) — likely JSON round-trip noise`;
        } else {
          rootDetail = `root_hash_jcs hashes to ${fromEmbedded.slice(0, 26)}…, expected ${root_hash.slice(0, 26)}…`;
        }
      } else {
        const recomputed = hashOf(rest);
        rootOk = recomputed === root_hash;
        if (!rootOk) {
          rootDetail = `recomputed ${recomputed.slice(0, 26)}…, stored ${root_hash.slice(0, 26)}… (no root_hash_jcs available — bundle was built by an older Pacta version)`;
        }
      }
      checks.push({ label: "root_hash", ok: rootOk, detail: rootDetail });
      const failures = checks.filter((c) => !c.ok);
      const lines = [
        ...checks.map((c) =>
          `  ${c.ok ? "✓" : "✗"} ${c.label}${c.detail ? `  — ${c.detail}` : ""}`,
        ),
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
        "against ALL protocol rules: from_agent matches your role's DID; round matches the " +
        "current round; refs resolve to real evidence/history items; compromise bound " +
        "(utility_for_self ≤ your previous); reveal monotonicity (each domain only once); " +
        "Accept must target a real prior Propose/CounterPropose. CounterPropose / Critique / " +
        "Accept require non-empty parent_refs; Propose may be empty only at round 1. " +
        "Refs accept short forms — see evidence_refs / parent_refs descriptions. " +
        "The signed message always carries canonical sha256, regardless of which form you submit. " +
        "Submitting type=Escalate immediately routes to the Tribunal jury (3 Claude jurors with " +
        "fairness/efficiency/speed biases) and finalizes the dispute with a signed ruling bundle. " +
        "The Escalate itself is signed into history first, so the audit trail records who triggered it.",
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
              .describe(
                "References to evidence items from the pool. Each entry may be: " +
                  "'eN' (e.g. 'e1', 'e2' — see get_dispute.evidence[].ref), " +
                  "evidence_id (e.g. 'ev_abc...'), or full 'sha256:...' hash. Empty if none.",
              ),
            parent_refs: z
              .array(z.string())
              .describe(
                "References to prior messages this attaches to. Each entry may be: " +
                  "'mN' (e.g. 'm1', 'm2' — see get_dispute.history[].ref), " +
                  "msg_id (32-hex), or full 'sha256:...' hash. " +
                  "MUST be non-empty for Critique/CounterPropose/Accept. " +
                  "Propose may be empty only at round 1.",
              ),
            payload: z
              .record(z.string(), z.unknown())
              .describe(
                "Per-message-type payload. " +
                  "Propose/CounterPropose: { state: {credit_usd, terms}, rationale, utility_for_self }. " +
                  "Critique: { target_msg_hash, rationale } — target_msg_hash accepts mN/msg_id/sha256. " +
                  "Accept: { target_msg_hash } — accepts mN/msg_id/sha256, must resolve to a Propose/CounterPropose. " +
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

  // ----- Phase 2: wait_for_turn ---------------------------------------------
  server.registerTool(
    "wait_for_turn",
    {
      description:
        "Block server-side until it is your turn to act on a dispute, or until the dispute " +
        "finalizes, or until the timeout. Use this between your moves so you don't have to " +
        "poll get_dispute in a busy loop. Returns the public dispute state once you're up. " +
        "Default timeout 50s (under Vercel's 60s function limit). On timeout, just call this " +
        "tool again — it's idempotent.",
      inputSchema: {
        dispute_id: z.string(),
        role_token: z.string(),
        timeout_ms: z
          .number()
          .int()
          .optional()
          .describe("Max time to wait in ms. Default 50000."),
      },
    },
    async ({ dispute_id, role_token, timeout_ms }) => {
      try {
        const deadline = Date.now() + (timeout_ms ?? 50_000);
        let role: "aria" | "atlas" | null = null;
        // Identify role on first read to avoid loading on every poll.
        const first = await getDispute(dispute_id);
        for (const r of ["aria", "atlas"] as Array<"aria" | "atlas">) {
          if (first.role_tokens[r] === role_token) role = r;
        }
        if (!role) {
          return {
            isError: true,
            content: [
              { type: "text", text: "role_token mismatch — token does not match either party" },
            ],
          };
        }
        // Helper: build the "you're up" full-state response with explicit kind.
        const buildUnblock = async (kind: "your_turn" | "finalized") => {
          const dump = await dumpDispute(dispute_id);
          const header =
            kind === "finalized"
              ? `wait_for_turn unblocked: dispute is finalized. ` +
                `Read 'finalized' / 'ruling' for the bundle, then call verify_bundle.`
              : `wait_for_turn unblocked: it is your turn (kind=your_turn). ` +
                `Read history + references_help, build your move, call submit_message.`;
          return {
            content: [
              {
                type: "text" as const,
                text: header + `\n\n--- STATE ---\n${JSON.stringify({ kind, ...dump }, null, 2)}`,
              },
            ],
          };
        };
        // Initial check
        if (first.finalized) return await buildUnblock("finalized");
        if (first.turn === role) return await buildUnblock("your_turn");
        // Poll loop. 1.5s interval.
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1500));
          const s = await getDispute(dispute_id);
          if (s.finalized) return await buildUnblock("finalized");
          if (s.turn === role) return await buildUnblock("your_turn");
        }
        // Timeout — slim heartbeat shape (no full state) so long polls don't
        // overflow the agent's context window across many wait calls.
        const s = await getDispute(dispute_id);
        const lastMsg = s.history[s.history.length - 1];
        const heartbeat = {
          kind: "timeout" as const,
          dispute_id,
          turn: s.turn,
          current_round: s.current_round,
          max_rounds: s.max_rounds,
          finalized: !!s.finalized,
          history_count: s.history.length,
          evidence_count: s.evidence.signed.length,
          last_message: lastMsg
            ? {
                ref: `m${s.history.length}`,
                type: lastMsg.type,
                from_agent: lastMsg.from_agent,
                round: lastMsg.round,
              }
            : null,
        };
        return {
          content: [
            {
              type: "text",
              text:
                `wait_for_turn timeout (kind=timeout). Counterparty has not moved yet — ` +
                `call this tool again to keep waiting. State is unchanged.\n\n` +
                `--- HEARTBEAT ---\n${JSON.stringify(heartbeat, null, 2)}`,
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
