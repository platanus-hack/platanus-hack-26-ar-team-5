import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { docHash, verifySignedDoc } from "../src/sign";
import { hash as hashOf } from "../src/canonical";
import { runPacta } from "../src/pacta";
import { loadEnv } from "../src/env";

loadEnv();
const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!HAS_KEY)("scenario live (Claude)", () => {
  it("ai-overrun converges or escalates within 5 rounds, signatures verify, bundle root_hash ok", async () => {
    const events: any[] = [];
    let bundle: any = null;
    for await (const ev of runPacta({ scenario: "ai-overrun" })) {
      events.push(ev);
      if (ev.kind === "bundle") bundle = ev.bundle;
    }
    expect(bundle).not.toBeNull();
    expect(bundle.scenario).toBe("ai-overrun");
    expect(["converged", "ruling", "deadline"]).toContain(bundle.outcome.kind);

    const poolHashes = new Set(bundle.evidence.map((e: any) => docHash(e)));
    for (const m of bundle.messages) {
      expect(verifySignedDoc(m), `msg ${docHash(m)} verifies`).toBe(true);
      for (const ref of m.evidence_refs) {
        expect(poolHashes.has(ref), `evidence ref ${ref} in pool`).toBe(true);
      }
    }
    const { root_hash, ...rest } = bundle;
    expect(hashOf(rest)).toBe(root_hash);

    mkdirSync("tmp", { recursive: true });
    writeFileSync("tmp/last-run.json", JSON.stringify(bundle, null, 2));
  }, 180_000);
});
