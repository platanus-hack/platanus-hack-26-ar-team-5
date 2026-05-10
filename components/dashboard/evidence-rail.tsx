"use client";

import type { DisputeDump, DumpEvidence, EvidenceTier } from "./types";
import { shortHash } from "./format";

type Props = {
  dispute: DisputeDump;
};

const TIER_TONE: Record<EvidenceTier, { label: string; cls: string }> = {
  S: { label: "S", cls: "border-amber-glow/40 bg-amber-glow/10 text-amber-glow" },
  A: { label: "A", cls: "border-pulse-green/30 bg-pulse-green/10 text-pulse-green" },
  B: { label: "B", cls: "border-line bg-graphite/60 text-ash-gray" },
  C: { label: "C", cls: "border-line/70 bg-graphite/40 text-dim" },
};

const TIER_DESC: Record<EvidenceTier, string> = {
  S: "Crypto self-verifying",
  A: "Public attestation",
  B: "Self-emitted, signed",
  C: "Argumentation only",
};

export function EvidenceRail({ dispute }: Props) {
  const ariaDid = dispute.agents.aria;
  const items = dispute.evidence;
  return (
    <section className="rounded-lg border border-line/70 bg-graphite/30">
      <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
        <div className="text-body font-medium text-polar-white">Evidence</div>
        <div className="text-caption text-dim">
          {items.length} {items.length === 1 ? "item" : "items"}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-8 text-center t-body text-dim">
          No evidence submitted yet.
        </div>
      ) : (
        <ul className="divide-y divide-line/50">
          {items.map((e) => (
            <EvidenceRow key={e.hash} e={e} ariaDid={ariaDid} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EvidenceRow({ e, ariaDid }: { e: DumpEvidence; ariaDid: string }) {
  const tone = TIER_TONE[e.tier] ?? TIER_TONE.B;
  const role: "aria" | "atlas" = e.submitter === ariaDid ? "aria" : "atlas";
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 transition-colors hover:bg-graphite/40">
          <span className="t-body text-dim transition-transform group-open:rotate-90">
            ›
          </span>

          {/* Tier pill */}
          <span
            className={`inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border font-mono text-[11px] font-semibold ${tone.cls}`}
            title={TIER_DESC[e.tier]}
          >
            {tone.label}
          </span>

          {/* Submitter dot */}
          <span
            className={`h-2 w-2 flex-none rounded-full ${
              role === "aria" ? "bg-aria" : "bg-atlas"
            }`}
            aria-label={role}
          />

          {/* Title */}
          <span className="t-label flex-1 truncate text-bone">{e.title}</span>

          {/* Ref */}
          <span className="hidden font-mono t-body text-dim sm:inline">
            {e.ref}
          </span>
        </summary>

        <div className="space-y-3 border-t border-line/40 bg-graphite/20 px-4 py-4">
          {e.body && (
            <p className="t-label leading-[22px] text-bone">{e.body}</p>
          )}
          <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 t-body">
            <dt className="text-ash-gray/70">tier</dt>
            <dd className="text-bone">
              {tone.label} · {TIER_DESC[e.tier]}
            </dd>
            <dt className="text-ash-gray/70">submitter</dt>
            <dd className="text-bone">{role}</dd>
            <dt className="text-ash-gray/70">hash</dt>
            <dd className="font-mono text-bone">#{shortHash(e.hash, 16)}</dd>
            <dt className="text-ash-gray/70">ref</dt>
            <dd className="font-mono text-bone">{e.ref}</dd>
          </dl>
        </div>
      </details>
    </li>
  );
}
