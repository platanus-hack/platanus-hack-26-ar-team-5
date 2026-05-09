import type { LLMDriver, MessageBody } from "../orchestrator.js";
import type { AgentBook } from "../agents.js";
import type { EvidenceTier, SignedMessage } from "../types.js";

/** A seed for one piece of pre-loaded evidence in a scenario. */
export type EvidenceSeed = {
  evidence_id: string;
  submitter: "aria" | "atlas";
  tier: EvidenceTier;
  title: string;
  body: string;
};

/** Minimal context a mock-driver step gets to make a decision. */
export type MockStepCtx = {
  history: SignedMessage[];
  ariaDid: string;
  atlasDid: string;
  ariaEvidenceHashes: string[];
  atlasEvidenceHashes: string[];
};

export type ScenarioMockStep = (ctx: MockStepCtx) => MessageBody;

/** Display metadata + role-specific system prompts. */
export type ScenarioAgentSpec = {
  display_name: string;
  short_label: string; // 5–6 char tag for CLI (e.g. "Aria  ", "Aurora")
  system_prompt: string;
};

export type Scenario = {
  id: string;
  name: string;
  description: string;
  case_summary: string;
  /** Used by the CLI to format `state` payloads (e.g. "USD" vs "treatment-plan"). */
  state_units: string;
  agents: { aria: ScenarioAgentSpec; atlas: ScenarioAgentSpec };
  evidence: EvidenceSeed[];
  /** Optional offline replay so the demo runs without an API key. */
  mock_script?: ScenarioMockStep[];
};

export type ScenarioId = string;

/** Helper: a typed factory that wraps the LLM driver if a scenario needs to override
 *  prompt details beyond what's in `agents.aria.system_prompt`. */
export type DriverFactory = (args: {
  agents: AgentBook;
  scenario: Scenario;
}) => LLMDriver;
