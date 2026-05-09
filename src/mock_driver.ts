/**
 * Deterministic mock LLM driver for testing and offline demos.
 * Walks through a scenario's `mock_script` step by step.
 */

import type { LLMDriver, MessageBody } from "./orchestrator.js";
import type { Scenario, ScenarioMockStep } from "./scenarios/types.js";

export type MockDriverOpts = {
  scenario: Scenario;
  ariaDid: string;
  atlasDid: string;
  ariaEvidenceHashes: string[];
  atlasEvidenceHashes: string[];
};

export function makeMockDriver(opts: MockDriverOpts): LLMDriver {
  if (!opts.scenario.mock_script || opts.scenario.mock_script.length === 0) {
    throw new Error(
      `Scenario '${opts.scenario.id}' has no mock_script. Provide one or use the live driver.`,
    );
  }
  const script: ScenarioMockStep[] = opts.scenario.mock_script;

  let idx = 0;
  return {
    async emit(input) {
      if (idx >= script.length) {
        throw new Error(`mock driver script exhausted for '${opts.scenario.id}'`);
      }
      const fn = script[idx++]!;
      // Tiny pause so the live stream feels real
      await new Promise((r) => setTimeout(r, 80));
      return fn({
        history: input.history,
        ariaDid: opts.ariaDid,
        atlasDid: opts.atlasDid,
        ariaEvidenceHashes: opts.ariaEvidenceHashes,
        atlasEvidenceHashes: opts.atlasEvidenceHashes,
      });
    },
  };
}
