/**
 * Cross-scenario smoke test: every registered scenario with a mock_script
 * runs end-to-end through runPacta() without violating any protocol invariant.
 * Asserts: every signed message verifies, every evidence_ref points at the pool,
 * the bundle root_hash matches the canonical recomputation.
 */
import { describe, expect, it } from "vitest";
import { hash as hashOf } from "../src/canonical";
import { docHash, verifySignedDoc } from "../src/sign";
import { runPacta, listScenarios } from "../src/pacta";

// Scenarios that converge bilaterally in mock mode are tested here.
// Deadlock scenarios (mock script designed to escalate to jury) are exercised
// in the dedicated live run + verifier — running them in this smoke test
// would call the live jury 3-LLM panel and burn API budget.
const CONVERGING = ["ai-overrun", "oncology", "cve-disclosure", "creative-brief"];

describe("scenarios (mocked smoke)", () => {
  for (const sc of listScenarios().filter((s) => CONVERGING.includes(s.id))) {
    it(`${sc.id} runs end-to-end with a mock driver`, async () => {
      const events: any[] = [];
      let bundle: any = null;
      for await (const ev of runPacta({ mock: true, scenario: sc.id })) {
        events.push(ev);
        if (ev.kind === "bundle") bundle = ev.bundle;
      }
      expect(bundle).not.toBeNull();
      expect(bundle.scenario).toBe(sc.id);

      // Every signed message verifies
      for (const m of bundle.messages) {
        expect(verifySignedDoc(m), `${sc.id}: message ${docHash(m)} should verify`).toBe(true);
      }
      // Evidence integrity
      const poolHashes = new Set(bundle.evidence.map((e: any) => docHash(e)));
      for (const e of bundle.evidence) {
        expect(verifySignedDoc(e)).toBe(true);
      }
      // Every evidence_ref must be in the pool
      for (const m of bundle.messages) {
        for (const ref of m.evidence_refs) {
          expect(poolHashes.has(ref), `${sc.id}: msg refs unknown evidence ${ref}`).toBe(true);
        }
      }
      // Root hash matches. root_hash protects the bundle content (bundleNoHash);
      // root_hash_jcs is a redundant transport-safe carrier of the canonical
      // bytes that produced the hash, so it's also stripped before recomputing.
      const { root_hash, root_hash_jcs, ...rest } = bundle;
      expect(hashOf(rest)).toBe(root_hash);
      // The embedded JCS string must hash to the same value (transport-safe path).
      expect(typeof root_hash_jcs).toBe("string");
      expect(hashOf(JSON.parse(root_hash_jcs))).toBe(root_hash);

      // Either converged or escalated to ruling — but we expect convergence on the canonical scripts
      expect(["converged", "ruling", "deadline"]).toContain(bundle.outcome.kind);
    }, 30_000);
  }
});
