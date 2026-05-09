import type { Scenario, ScenarioId } from "./types.js";
import { aiOverrun } from "./ai-overrun.js";
import { oncology } from "./oncology.js";
import { cveDisclosure } from "./cve-disclosure.js";
import { creativeBrief } from "./creative-brief.js";
import { deadlockLeak } from "./deadlock-leak.js";
import { deadlockFairuse } from "./deadlock-fairuse.js";

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  [aiOverrun.id]: aiOverrun,
  [oncology.id]: oncology,
  [cveDisclosure.id]: cveDisclosure,
  [creativeBrief.id]: creativeBrief,
  [deadlockLeak.id]: deadlockLeak,
  [deadlockFairuse.id]: deadlockFairuse,
};

export const DEFAULT_SCENARIO_ID: ScenarioId = aiOverrun.id;

export function getScenario(id?: string): Scenario {
  const key = id ?? DEFAULT_SCENARIO_ID;
  const found = SCENARIOS[key];
  if (!found) {
    throw new Error(
      `Unknown scenario '${key}'. Available: ${Object.keys(SCENARIOS).join(", ")}`,
    );
  }
  return found;
}

export function listScenarios(): Array<{ id: string; name: string; description: string }> {
  return Object.values(SCENARIOS).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
  }));
}

export type { Scenario } from "./types.js";
