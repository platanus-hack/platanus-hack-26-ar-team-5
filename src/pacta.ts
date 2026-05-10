import { hash as hashOf, canonicalize } from "./canonical";
import { bootAgents } from "./agents";
import { buildEvidencePool } from "./fixtures";
import {
  runNegotiation,
  type LLMDriver,
  type OrchestratorConfig,
  type OrchestratorEvent,
} from "./orchestrator";
import { makeClaudeDriver } from "./claude_driver";
import { makeMockDriver } from "./mock_driver";
import { deliberate } from "./jury";
import type { Bundle, SignedRuling, SignedVote, TribunalMode } from "./types";
import { docHash } from "./sign";
import { getScenario, listScenarios, type Scenario } from "./scenarios/index";

export type RunOptions = {
  /** Scenario id (e.g. "ai-overrun", "oncology"). Defaults to ai-overrun. */
  scenario?: string;
  /** Override the LLM driver (advanced). */
  driver?: LLMDriver;
  /** If true, use the deterministic mock driver instead of Claude. */
  mock?: boolean;
  orchestratorConfig?: Partial<OrchestratorConfig>;
  /** Pre-commit dispute-resolution mode. Defaults to `binding`. Under `none`,
   *  the CLI demo will finalize as a deadline (no jury) when bilateral
   *  negotiation can't close. */
  tribunal_mode?: TribunalMode;
};

export type StreamEvent =
  | { kind: "scenario.selected"; scenario: { id: string; name: string; case_summary: string } }
  | OrchestratorEvent
  | { kind: "jury.start" }
  | { kind: "jury.vote"; vote: SignedVote }
  | { kind: "jury.ruling"; ruling: SignedRuling }
  | { kind: "bundle"; bundle: Bundle };

/**
 * High-level Pacta entry point. Yields a stream of events, ending with a Bundle.
 */
export async function* runPacta(options: RunOptions = {}): AsyncGenerator<StreamEvent, Bundle, void> {
  const scenario: Scenario = getScenario(options.scenario);
  yield {
    kind: "scenario.selected",
    scenario: { id: scenario.id, name: scenario.name, case_summary: scenario.case_summary },
  };

  const agents = bootAgents();
  const pool = buildEvidencePool(agents, scenario);

  const driver =
    options.driver ??
    (options.mock
      ? makeMockDriver({
          scenario,
          ariaDid: agents.aria.did,
          atlasDid: agents.atlas.did,
          ariaEvidenceHashes: pool.signed
            .filter((e) => e.submitter === agents.aria.did)
            .map((e) => docHash(e)),
          atlasEvidenceHashes: pool.signed
            .filter((e) => e.submitter === agents.atlas.did)
            .map((e) => docHash(e)),
        })
      : makeClaudeDriver({
          scenario,
          didByRole: { aria: agents.aria.did, atlas: agents.atlas.did },
        }));

  const config = {
    maxRounds: 5,
    deadlockEpsilon: 0.05,
    deadlockFlatRounds: 2,
    scenario,
    ...options.orchestratorConfig,
  };

  const gen = runNegotiation(agents, pool, driver, config);
  let result: Awaited<ReturnType<typeof gen.next>>;
  do {
    result = await gen.next();
    if (!result.done) yield result.value;
  } while (!result.done);

  const negotiationOutcome = result.value.outcome;

  const tribunal_mode: TribunalMode = options.tribunal_mode ?? "binding";

  let bundleOutcome: Bundle["outcome"];
  if (negotiationOutcome.kind === "converged") {
    bundleOutcome = {
      kind: "converged",
      final_state: negotiationOutcome.final_state,
      accepted_msg_hash: negotiationOutcome.accepted_msg_hash,
    };
  } else if (
    (negotiationOutcome.kind === "escalation" ||
      negotiationOutcome.kind === "deadlock") &&
    tribunal_mode === "binding"
  ) {
    yield { kind: "jury.start" };
    const { votes, ruling } = await deliberate({
      agents,
      evidence: pool,
      history: result.value.history,
      scenario,
    });
    for (const v of votes) yield { kind: "jury.vote", vote: v };
    yield { kind: "jury.ruling", ruling };
    bundleOutcome = { kind: "ruling", votes, ruling };
  } else {
    // Either explicit deadline, OR negotiation broke down under tribunal_mode=none
    // (parties opted out of the jury failsafe at open).
    bundleOutcome = { kind: "deadline" };
  }

  const bundleNoHash: Omit<Bundle, "root_hash" | "root_hash_jcs"> = {
    type: "Bundle",
    bundle_version: 2,
    scenario: scenario.id,
    agents: {
      aria: agents.aria.did,
      atlas: agents.atlas.did,
      tribunal: agents.tribunal.did,
    },
    tribunal_mode,
    // CLI demo: both sides Claude-driven from a scenario template, no real
    // human-mapped opener. Keep null so audit consumers don't misattribute.
    opened_by_role: null,
    state_schema: {
      ref: scenario.state_schema.ref,
      domain: scenario.state_schema.domain,
      description: scenario.state_schema.description,
      json_schema: scenario.state_schema.jsonSchema,
    },
    evidence: pool.signed,
    messages: result.value.history,
    outcome: bundleOutcome,
    created_at: new Date().toISOString(),
  };
  const bundle: Bundle = {
    ...bundleNoHash,
    root_hash: hashOf(bundleNoHash),
    root_hash_jcs: canonicalize(bundleNoHash),
  };

  yield { kind: "bundle", bundle };
  return bundle;
}

export { docHash, listScenarios, getScenario };
