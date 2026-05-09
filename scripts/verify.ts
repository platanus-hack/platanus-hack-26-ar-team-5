#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import pc from "picocolors";
import { verifySignedDoc, docHash } from "../src/sign.js";
import { hash as hashOf } from "../src/canonical.js";
import type { Bundle, SignedDoc } from "../src/types.js";

function shortHash(h: string): string {
  return h.length > 18 ? `${h.slice(0, 14)}…${h.slice(-2)}` : h;
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: pnpm verify <bundle.json>");
    process.exit(2);
  }
  const raw = readFileSync(path, "utf-8");
  const bundle = JSON.parse(raw) as Bundle;
  console.log(pc.bold(`Verifying ${path}`));
  console.log(pc.gray(`  scenario:   ${bundle.scenario}`));
  console.log(pc.gray(`  outcome:    ${bundle.outcome.kind}`));
  console.log(pc.gray(`  evidence:   ${bundle.evidence.length} items`));
  console.log(pc.gray(`  messages:   ${bundle.messages.length} items`));
  console.log("");

  let failures = 0;
  const checks: Array<{ label: string; doc: SignedDoc<object>; }> = [];
  for (const e of bundle.evidence) checks.push({ label: `evidence ${e.evidence_id}`, doc: e });
  for (const m of bundle.messages) checks.push({ label: `message ${m.type} hash ${shortHash(docHash(m))}`, doc: m });
  if (bundle.outcome.kind === "ruling") {
    for (const v of bundle.outcome.votes) checks.push({ label: `vote ${v.juror}`, doc: v });
    checks.push({ label: `ruling`, doc: bundle.outcome.ruling });
  }
  for (const c of checks) {
    const ok = verifySignedDoc(c.doc);
    if (ok) {
      console.log(`  ${pc.green("✓")} ${c.label}`);
    } else {
      console.log(`  ${pc.red("✗")} ${c.label}`);
      failures++;
    }
  }

  // Verify root_hash. Prefer the embedded JCS string when present (transport-safe);
  // fall back to recomputing canonicalize(bundle minus root_hash) for older bundles.
  const { root_hash, root_hash_jcs, ...rest } = bundle as Bundle & { root_hash_jcs?: string };
  let rootOk = false;
  let rootDetail = "";
  if (typeof root_hash_jcs === "string" && root_hash_jcs.length > 0) {
    const fromEmbedded = hashOf(JSON.parse(root_hash_jcs));
    if (fromEmbedded === root_hash) {
      rootOk = true;
      rootDetail = " (via root_hash_jcs)";
    } else {
      rootDetail = ` (root_hash_jcs hashes to ${shortHash(fromEmbedded)})`;
    }
  } else {
    const recomputed = hashOf(rest);
    rootOk = recomputed === root_hash;
    if (!rootOk) rootDetail = ` (recomputed ${shortHash(recomputed)})`;
  }
  if (rootOk) {
    console.log(`  ${pc.green("✓")} root_hash matches${rootDetail}`);
  } else {
    console.log(`  ${pc.red("✗")} root_hash mismatch (expected ${shortHash(root_hash)})${rootDetail}`);
    failures++;
  }

  console.log("");
  if (failures === 0) {
    console.log(pc.green(`All ${checks.length + 1} checks passed.`));
    process.exit(0);
  } else {
    console.log(pc.red(`${failures} check(s) failed.`));
    process.exit(1);
  }
}

main();
