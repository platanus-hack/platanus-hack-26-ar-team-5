import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { bootAgents } from "../src/agents.js";
import { buildEvidencePool } from "../src/fixtures.js";
import { runNegotiation } from "../src/orchestrator.js";
import { docHash, verifySignedDoc } from "../src/sign.js";
import { makeClaudeDriver } from "../src/claude_driver.js";
import { loadEnv } from "../src/env.js";

loadEnv();
const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!HAS_KEY)("scenario live (Claude)", () => {
  it("converges or escalates within 5 rounds, every message verifies", async () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents);
    const driver = makeClaudeDriver({
      didByRole: { aria: agents.aria.did, atlas: agents.atlas.did },
    });

    const events: Array<{ kind: string; [k: string]: unknown }> = [];
    const gen = runNegotiation(agents, pool, driver, {
      maxRounds: 5,
      deadlockEpsilon: 0.05,
      deadlockFlatRounds: 2,
    });
    let result: Awaited<ReturnType<typeof gen.next>>;
    do {
      result = await gen.next();
      if (!result.done) events.push(result.value);
    } while (!result.done);

    expect(["converged", "escalation", "deadline"]).toContain(result.value.outcome.kind);

    // Every signed message verifies
    for (const m of result.value.history) {
      expect(verifySignedDoc(m), `msg ${docHash(m)} should verify`).toBe(true);
      // Every evidence_ref must point to a real evidence item
      for (const h of m.evidence_refs) {
        expect(pool.byHash.has(h), `evidence ${h} should be in pool`).toBe(true);
      }
    }

    // Persist the run for inspection
    mkdirSync("tmp", { recursive: true });
    writeFileSync(
      "tmp/last-run.json",
      JSON.stringify(
        {
          agents: { aria: agents.aria.did, atlas: agents.atlas.did },
          evidence: pool.signed,
          messages: result.value.history,
          outcome: result.value.outcome,
          events,
        },
        null,
        2,
      ),
    );
  }, 120_000);
});
