import { hash as hashOf } from "./canonical.js";
import { bootAgents } from "./agents.js";
import { buildEvidencePool } from "./fixtures.js";
import { runNegotiation, type LLMDriver, type OrchestratorConfig, type OrchestratorEvent } from "./orchestrator.js";
import { makeClaudeDriver } from "./claude_driver.js";
import { makeMockDriver } from "./mock_driver.js";
import { deliberate } from "./jury.js";
import type { Bundle, SignedRuling, SignedVote } from "./types.js";
import { docHash } from "./sign.js";

export type RunOptions = {
  scenario?: "ai-overrun";
  driver?: LLMDriver;
  /** If true, use the deterministic mock driver instead of Claude. */
  mock?: boolean;
  orchestratorConfig?: Partial<OrchestratorConfig>;
};

export type StreamEvent =
  | OrchestratorEvent
  | { kind: "jury.start" }
  | { kind: "jury.vote"; vote: SignedVote }
  | { kind: "jury.ruling"; ruling: SignedRuling }
  | { kind: "bundle"; bundle: Bundle };

/**
 * High-level Pacta entry point. Yields a stream of events, ending with a Bundle.
 */
export async function* runPacta(options: RunOptions = {}): AsyncGenerator<StreamEvent, Bundle, void> {
  const agents = bootAgents();
  const pool = buildEvidencePool(agents);

  const driver =
    options.driver ??
    (options.mock
      ? makeMockDriver({
          ariaDid: agents.aria.did,
          atlasDid: agents.atlas.did,
          ariaEvidenceHashes: pool.signed
            .filter((e) => e.submitter === agents.aria.did)
            .map((e) => docHash(e)),
          atlasEvidenceHashes: pool.signed
            .filter((e) => e.submitter === agents.atlas.did)
            .map((e) => docHash(e)),
        })
      : makeClaudeDriver({ didByRole: { aria: agents.aria.did, atlas: agents.atlas.did } }));

  const config = {
    maxRounds: 5,
    deadlockEpsilon: 0.05,
    deadlockFlatRounds: 2,
    ...options.orchestratorConfig,
  };

  const gen = runNegotiation(agents, pool, driver, config);
  let result: Awaited<ReturnType<typeof gen.next>>;
  do {
    result = await gen.next();
    if (!result.done) yield result.value;
  } while (!result.done);

  const negotiationOutcome = result.value.outcome;

  let bundleOutcome: Bundle["outcome"];
  if (negotiationOutcome.kind === "converged") {
    bundleOutcome = {
      kind: "converged",
      final_state: negotiationOutcome.final_state,
      accepted_msg_hash: negotiationOutcome.accepted_msg_hash,
    };
  } else if (
    negotiationOutcome.kind === "escalation" ||
    negotiationOutcome.kind === "deadlock"
  ) {
    yield { kind: "jury.start" };
    const { votes, ruling } = await deliberate({
      agents,
      evidence: pool,
      history: result.value.history,
    });
    for (const v of votes) yield { kind: "jury.vote", vote: v };
    yield { kind: "jury.ruling", ruling };
    bundleOutcome = { kind: "ruling", votes, ruling };
  } else {
    bundleOutcome = { kind: "deadline" };
  }

  // Build bundle (root_hash computed over the bundle minus root_hash itself)
  const bundleNoHash: Omit<Bundle, "root_hash"> = {
    type: "Bundle",
    scenario: options.scenario ?? "ai-overrun",
    agents: {
      aria: agents.aria.did,
      atlas: agents.atlas.did,
      tribunal: agents.tribunal.did,
    },
    evidence: pool.signed,
    messages: result.value.history,
    outcome: bundleOutcome,
    created_at: new Date().toISOString(),
  };
  const bundle: Bundle = {
    ...bundleNoHash,
    root_hash: hashOf(bundleNoHash),
  };

  yield { kind: "bundle", bundle };
  return bundle;
}

export { docHash };
