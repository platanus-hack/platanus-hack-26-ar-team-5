"use client";

import type { DisputeDump, DumpEvidence, EvidenceTier } from "./types";
import { shortHash } from "./format";

type Props = {
  dispute: DisputeDump;
};

const TIER_TONE: Record<EvidenceTier, { label: string; cls: string }> = {
  S: { label: "S · signed", cls: "border-amber-glow/40 bg-amber-glow/10 text-amber-glow" },
  A: { label: "A · public", cls: "border-pulse-green/30 bg-pulse-green/10 text-pulse-green" },
  B: { label: "B · self", cls: "border-line bg-graphite/60 text-ash-gray" },
  C: { label: "C · narrative", cls: "border-line/70 bg-graphite/40 text-dim" },
};

export function EvidenceRail({ dispute }: Props) {
  const ariaDid = dispute.agents.aria;
  const items = dispute.evidence;
  return (
    <section className="rounded-lg border border-line/70 bg-graphite/40">
      <div className="flex items-center justify-between border-b border-line/70 px-4 py-2.5">
        <div className="text-micro uppercase tracking-[0.2em] text-ash-gray">
          Evidence pool
        </div>
        <div className="text-micro text-dim">{items.length} items</div>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-caption text-dim">
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
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="flex w-12 flex-col gap-0.5 pt-0.5 text-micro">
        <span className="font-mono tabular text-bone">{e.ref}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-micro tracking-[0.05em] ${tone.cls}`}
          >
            {tone.label}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-micro tracking-[0.05em] ${
              role === "aria"
                ? "border-aria/30 bg-aria/5 text-aria"
                : "border-atlas/30 bg-atlas/5 text-atlas"
            }`}
          >
            <span
              className={`h-1 w-1 rounded-full ${
                role === "aria" ? "bg-aria" : "bg-atlas"
              }`}
            />
            {role}
          </span>
          <span className="font-mono text-caption text-polar-white">
            {e.title}
          </span>
          <span className="ml-auto font-mono text-micro text-dim">
            #{shortHash(e.hash, 10)}
          </span>
        </div>
        {e.body && (
          <p className="line-clamp-2 text-caption text-ash-gray">{e.body}</p>
        )}
      </div>
    </li>
  );
}
