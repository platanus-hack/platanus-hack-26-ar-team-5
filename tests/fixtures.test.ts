import { describe, expect, it } from "vitest";
import { bootAgents } from "../src/agents.js";
import { buildEvidencePool } from "../src/fixtures.js";
import { verifySignedDoc, docHash } from "../src/sign.js";

describe("fixtures (mocked)", () => {
  it("boots Aria, Atlas, Tribunal with valid did:key DIDs", () => {
    const a = bootAgents();
    expect(a.aria.did).toMatch(/^did:key:z6Mk/);
    expect(a.atlas.did).toMatch(/^did:key:z6Mk/);
    expect(a.tribunal.did).toMatch(/^did:key:z6Mk/);
    expect(new Set([a.aria.did, a.atlas.did, a.tribunal.did]).size).toBe(3);
  });

  it("loads exactly 9 evidence items, each signed by the right agent", () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents);
    expect(pool.signed).toHaveLength(9);
    const ariaCount = pool.signed.filter((e) => e.submitter === agents.aria.did).length;
    const atlasCount = pool.signed.filter((e) => e.submitter === agents.atlas.did).length;
    expect(ariaCount).toBe(4);
    expect(atlasCount).toBe(5);
  });

  it("every evidence verifies with Ed25519 against its signer DID", () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents);
    for (const e of pool.signed) {
      expect(verifySignedDoc(e), `evidence ${e.evidence_id} should verify`).toBe(true);
    }
  });

  it("evidence hashes are unique and indexable", () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents);
    expect(pool.byHash.size).toBe(9);
    for (const e of pool.signed) {
      const h = docHash(e);
      expect(pool.byHash.get(h)).toBe(e);
    }
  });

  it("evidence tier distribution is correct (5×S, 3×A, 1×B)", () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents);
    const tiers = pool.signed.map((e) => e.tier).sort();
    expect(tiers.filter((t) => t === "S").length).toBe(5);
    expect(tiers.filter((t) => t === "A").length).toBe(3);
    expect(tiers.filter((t) => t === "B").length).toBe(1);
  });
});
