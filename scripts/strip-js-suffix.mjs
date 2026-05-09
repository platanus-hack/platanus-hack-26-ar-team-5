#!/usr/bin/env node
// One-shot codemod: drop the explicit `.js` suffix from relative TS imports.
// Lets Next.js / Turbopack resolve them straight to the .ts source while still
// working with tsx + vitest (which handle bare imports fine in ESM mode).
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "tests", "examples", "scripts"];
const PATTERN = /(from\s+["'])(\.\.?\/[^"'\n]+?)\.js(["'])/g;
const SIDE_EFFECT_PATTERN = /(import\s+["'])(\.\.?\/[^"'\n]+?)\.js(["'])/g;

function walk(dir, out = []) {
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

let touched = 0;
for (const root of ROOTS) {
  let files;
  try {
    files = walk(root);
  } catch {
    continue;
  }
  for (const f of files) {
    const before = readFileSync(f, "utf8");
    const after = before
      .replace(PATTERN, "$1$2$3")
      .replace(SIDE_EFFECT_PATTERN, "$1$2$3");
    if (after !== before) {
      writeFileSync(f, after);
      touched++;
      console.log(`rewrote ${f}`);
    }
  }
}
console.log(`done — ${touched} file(s) rewritten`);
