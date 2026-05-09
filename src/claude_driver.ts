import type Anthropic from "@anthropic-ai/sdk";
import type { LLMDriver, MessageBody } from "./orchestrator.js";
import type { SignedEvidence, SignedMessage } from "./types.js";
import { docHash } from "./sign.js";
import { getClient, MODELS } from "./anthropic.js";
import { ARIA_SYSTEM, ATLAS_SYSTEM, TOOLS } from "./prompts.js";

const SYSTEM_BY_ROLE = {
  aria: ARIA_SYSTEM,
  atlas: ATLAS_SYSTEM,
} as const;

function evidenceCatalog(evidence: SignedEvidence[]): string {
  return evidence
    .map((e) => {
      return [
        `- evidence_id: ${e.evidence_id}`,
        `  hash: ${docHash(e)}`,
        `  tier: ${e.tier}`,
        `  submitter: ${e.submitter}`,
        `  title: ${e.title}`,
        `  body: ${e.body}`,
      ].join("\n");
    })
    .join("\n\n");
}

function historyTranscript(history: SignedMessage[]): string {
  if (history.length === 0) return "(no prior messages — you open the negotiation)";
  return history
    .map((m, i) => {
      const h = docHash(m);
      const lines = [
        `[${i + 1}] ${m.type}  hash: ${h}`,
        `    from: ${m.from_agent}`,
        `    round: ${m.round}`,
        `    evidence_refs: ${JSON.stringify(m.evidence_refs)}`,
        `    parent_refs:   ${JSON.stringify(m.parent_refs)}`,
        `    payload: ${JSON.stringify(m.payload)}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

function buildUserPrompt(args: {
  role: "aria" | "atlas";
  did: string;
  round: number;
  history: SignedMessage[];
  evidence: SignedEvidence[];
}): string {
  const ownEvidence = args.evidence.filter((e) => e.submitter === args.did);
  const otherEvidence = args.evidence.filter((e) => e.submitter !== args.did);
  return [
    `## Round ${args.round}. It is your turn (${args.role}).`,
    ``,
    `## Your DID`,
    args.did,
    ``,
    `## Your evidence pool (you may cite any of these)`,
    evidenceCatalog(ownEvidence),
    ``,
    `## Counterparty evidence pool (also citable)`,
    evidenceCatalog(otherEvidence),
    ``,
    `## Message history`,
    historyTranscript(args.history),
    ``,
    `## Instruction`,
    `Emit exactly one message via a tool call. Pick the most strategic primitive.`,
    `Remember: compromise bound (utility_for_self ≤ your previous), reveal monotonicity,`,
    `evidence/parent refs must be exact sha256:... hashes from above.`,
  ].join("\n");
}

type ToolName =
  | "propose"
  | "counter_propose"
  | "critique"
  | "accept"
  | "reveal"
  | "escalate";

function toolToBody(args: {
  toolName: ToolName;
  input: Record<string, unknown>;
  did: string;
  round: number;
}): MessageBody {
  const { toolName, input, did, round } = args;
  const evidence_refs = (input.evidence_refs as string[]) ?? [];
  const parent_refs = (input.parent_refs as string[]) ?? [];
  switch (toolName) {
    case "propose":
      return {
        type: "Propose",
        round,
        from_agent: did,
        evidence_refs,
        parent_refs,
        payload: {
          state: input.state as { credit_usd: number; terms: string },
          rationale: String(input.rationale ?? ""),
          utility_for_self: Number(input.utility_for_self ?? 0),
        },
      };
    case "counter_propose":
      return {
        type: "CounterPropose",
        round,
        from_agent: did,
        evidence_refs,
        parent_refs,
        payload: {
          state: input.state as { credit_usd: number; terms: string },
          rationale: String(input.rationale ?? ""),
          utility_for_self: Number(input.utility_for_self ?? 0),
        },
      };
    case "critique":
      return {
        type: "Critique",
        round,
        from_agent: did,
        evidence_refs,
        parent_refs,
        payload: {
          target_msg_hash: String(input.target_msg_hash ?? ""),
          rationale: String(input.rationale ?? ""),
        },
      };
    case "accept":
      return {
        type: "Accept",
        round,
        from_agent: did,
        evidence_refs,
        parent_refs,
        payload: {
          target_msg_hash: String(input.target_msg_hash ?? ""),
        },
      };
    case "reveal":
      return {
        type: "Reveal",
        round,
        from_agent: did,
        evidence_refs,
        parent_refs,
        payload: {
          domain: String(input.domain ?? ""),
          information: String(input.information ?? ""),
        },
      };
    case "escalate":
      return {
        type: "Escalate",
        round,
        from_agent: did,
        evidence_refs,
        parent_refs,
        payload: {
          reason: String(input.reason ?? ""),
          requested_action:
            (input.requested_action as "mediator" | "deadline_extension") ?? "mediator",
        },
      };
  }
}

export type ClaudeDriverOptions = {
  model?: string;
  didByRole: Record<"aria" | "atlas", string>;
};

export function makeClaudeDriver(opts: ClaudeDriverOptions): LLMDriver {
  const model = opts.model ?? MODELS.negotiator;
  return {
    async emit(input) {
      const client = getClient();
      const did = opts.didByRole[input.role];
      const sys = SYSTEM_BY_ROLE[input.role];
      const userPrompt = buildUserPrompt({
        role: input.role,
        did,
        round: input.round,
        history: input.history,
        evidence: input.evidence,
      });

      const resp = await client.messages.create({
        model,
        max_tokens: 1500,
        system: sys,
        tools: TOOLS as unknown as Anthropic.Tool[],
        tool_choice: { type: "any", disable_parallel_tool_use: true },
        messages: [{ role: "user", content: userPrompt }],
      });

      // Find the first tool_use block
      for (const block of resp.content) {
        if (block.type === "tool_use") {
          const toolName = block.name as ToolName;
          const inputObj = (block.input ?? {}) as Record<string, unknown>;
          return toolToBody({
            toolName,
            input: inputObj,
            did,
            round: input.round,
          });
        }
      }
      throw new Error(
        `Claude (${input.role} round ${input.round}) returned no tool_use block`,
      );
    },
  };
}

