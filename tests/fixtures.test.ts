import { describe, expect, it } from "vitest";
import { bootAgents } from "../src/agents";
import { buildEvidencePool } from "../src/fixtures";
import { verifySignedDoc, docHash } from "../src/sign";
import { aiOverrun } from "../src/scenarios/ai-overrun";
import { oncology } from "../src/scenarios/oncology";
import { SCENARIOS } from "../src/scenarios/index";

describe("fixtures (mocked)", () => {
  it("boots Aria, Atlas, Tribunal with valid did:key DIDs", () => {
    const a = bootAgents();
    expect(a.aria.did).toMatch(/^did:key:z6Mk/);
    expect(a.atlas.did).toMatch(/^did:key:z6Mk/);
    expect(a.tribunal.did).toMatch(/^did:key:z6Mk/);
    expect(new Set([a.aria.did, a.atlas.did, a.tribunal.did]).size).toBe(3);
  });

  it("ai-overrun: loads exactly 9 evidence items, signed by the right agent", () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, aiOverrun);
    expect(pool.signed).toHaveLength(9);
    const ariaCount = pool.signed.filter((e) => e.submitter === agents.aria.did).length;
    const atlasCount = pool.signed.filter((e) => e.submitter === agents.atlas.did).length;
    expect(ariaCount).toBe(4);
    expect(atlasCount).toBe(5);
  });

  it("oncology: loads exactly 9 evidence items, signed by the right agent", () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, oncology);
    expect(pool.signed).toHaveLength(9);
    const ariaCount = pool.signed.filter((e) => e.submitter === agents.aria.did).length;
    const atlasCount = pool.signed.filter((e) => e.submitter === agents.atlas.did).length;
    expect(ariaCount).toBe(4);
    expect(atlasCount).toBe(5);
  });

  it("every evidence in every scenario verifies", () => {
    const agents = bootAgents();
    for (const scenario of Object.values(SCENARIOS)) {
      const pool = buildEvidencePool(agents, scenario);
      for (const e of pool.signed) {
        expect(verifySignedDoc(e), `${scenario.id}/${e.evidence_id} should verify`).toBe(true);
      }
    }
  });

  it("evidence hashes are unique and indexable per scenario", () => {
    const agents = bootAgents();
    for (const scenario of Object.values(SCENARIOS)) {
      const pool = buildEvidencePool(agents, scenario);
      expect(pool.byHash.size).toBe(scenario.evidence.length);
      for (const e of pool.signed) {
        const h = docHash(e);
        expect(pool.byHash.get(h)).toBe(e);
      }
    }
  });

  it("ai-overrun evidence tier distribution (5×S, 3×A, 1×B)", () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, aiOverrun);
    const tiers = pool.signed.map((e) => e.tier);
    expect(tiers.filter((t) => t === "S").length).toBe(5);
    expect(tiers.filter((t) => t === "A").length).toBe(3);
    expect(tiers.filter((t) => t === "B").length).toBe(1);
  });

  it("oncology evidence tier distribution", () => {
    const agents = bootAgents();
    const pool = buildEvidencePool(agents, oncology);
    const tiers = pool.signed.map((e) => e.tier);
    // Oncology has more A-tier (papers/guidelines) and 2 Tier-B (internal policies)
    expect(tiers.filter((t) => t === "S").length).toBeGreaterThanOrEqual(3);
    expect(tiers.filter((t) => t === "A").length).toBeGreaterThanOrEqual(3);
    expect(tiers.filter((t) => t === "B").length).toBeGreaterThanOrEqual(1);
  });
});
