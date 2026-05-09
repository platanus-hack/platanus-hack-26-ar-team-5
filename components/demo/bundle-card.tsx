"use client";

import { useState } from "react";
import type { Bundle } from "../../src/types";

export function BundleCard({ bundle }: { bundle: Bundle | undefined }) {
  const [copied, setCopied] = useState(false);

  if (!bundle) {
    return (
      <div className="rounded-lg border border-dark-carbon bg-deep-space p-5">
        <span className="font-input text-caption uppercase tracking-tight text-ash-gray">
          bundle
        </span>
        <div className="mt-4 grid gap-2" aria-live="polite">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-5 rounded-sm border border-dark-carbon bg-midnight-void pacta-shimmer"
            />
          ))}
        </div>
        <p className="mt-3 font-input text-caption text-dark-carbon">
          ed25519 bundle will be sealed when the run ends.
        </p>
      </div>
    );
  }

  const o = bundle.outcome;
  const outcomeLabel =
    o.kind === "converged"
      ? "CONVERGED"
      : o.kind === "ruling"
        ? "RULING"
        : "DEADLINE";
  const outcomeTint =
    o.kind === "converged"
      ? "text-neon-green"
      : o.kind === "ruling"
        ? "text-amber-glow"
        : "text-slate";

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(bundle!.root_hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }

  function downloadBundle() {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pacta-bundle-${bundle!.scenario}-${bundle!.root_hash.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-neon-green/40 bg-deep-space p-5">
      <div className="flex items-center justify-between">
        <span className="font-input text-caption uppercase tracking-tight text-ash-gray">
          bundle · sealed
        </span>
        <span
          className={[
            "font-input text-caption uppercase tracking-tight",
            outcomeTint,
          ].join(" ")}
        >
          {outcomeLabel}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 font-input text-caption text-ash-gray">
        <div className="flex items-baseline justify-between">
          <dt>scenario</dt>
          <dd className="text-polar-white">{bundle.scenario}</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt>messages</dt>
          <dd className="text-polar-white">{bundle.messages.length}</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt>evidence</dt>
          <dd className="text-polar-white">{bundle.evidence.length}</dd>
        </div>
        {o.kind === "converged" ? (
          <div className="flex items-baseline justify-between">
            <dt>final_credit</dt>
            <dd className="text-neon-green">
              ${o.final_state.credit_usd.toLocaleString()}
            </dd>
          </div>
        ) : null}
      </dl>

      <div
        className="mt-4 break-all rounded-md border border-dark-carbon bg-midnight-void px-3 py-2 font-input text-[12px] text-polar-white"
        aria-label="bundle root_hash"
      >
        <span className="text-ash-gray">root_hash · </span>
        {bundle.root_hash}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={copyHash}
          className="rounded-button border border-dark-carbon px-3 py-1.5 font-input text-caption uppercase tracking-tight text-polar-white transition-colors hover:bg-absolute-zero/[0.04] active:translate-y-[1px]"
        >
          {copied ? "copied ✓" : "copy hash"}
        </button>
        <button
          type="button"
          onClick={downloadBundle}
          className="rounded-button border border-dark-carbon px-3 py-1.5 font-input text-caption uppercase tracking-tight text-polar-white transition-colors hover:bg-absolute-zero/[0.04] active:translate-y-[1px]"
        >
          download json
        </button>
      </div>
    </div>
  );
}
