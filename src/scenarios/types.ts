import type { LLMDriver, MessageBody } from "../orchestrator";
import type { AgentBook } from "../agents";
import type { EvidenceTier, SignedMessage } from "../types";
import type { StateSchemaResult } from "../state_schema";
import type { ScenarioUtilityConfig } from "../utility";

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
  /** Compiled state-schema declaration. The orchestrator validates every
   *  Propose/CounterPropose state and the jury's Ruling.remedy against this.
   *  The JSON-Schema fragment is also embedded in the bundle so a third-party
   *  auditor can read `final_state` without assuming any specific domain. */
  state_schema: StateSchemaResult;
  /** Per-party utility derivation. When present, the orchestrator computes
   *  utility from the SIGNED state (not from the LLM-autoreported scalar) and
   *  enforces the compromise bound on that derived value. Also drives the
   *  Zeuthen risk advisory pushed to LLM prompts after each round.
   *
   *  Optional for backward compat — schema-less / legacy scenarios fall back
   *  to the autoreported `utility_for_self` enforcement. New scenarios should
   *  declare a `utility_config` so the bound is non-trivial.
   *
   *  Theory anchor: Rosenschein & Zlotkin (1994) "Rules of Encounter",
   *  Monotonic Concession Protocol with Zeuthen strategy. See
   *  docs/PROTOCOL_FOUNDATIONS.md §A. */
  utility_config?: ScenarioUtilityConfig;
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
