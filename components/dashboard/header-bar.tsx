"use client";

import type { DisputeDump } from "./types";
import { shortHash } from "./format";

type Props = {
  dispute: DisputeDump | null;
  online: boolean;
};

export function HeaderBar({ dispute, online }: Props) {
  return (
    <header className="border-b border-line/70 bg-midnight-void/60 px-6 py-4 backdrop-blur-md">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="t-body uppercase tracking-[0.22em] text-ash-gray">
            Dispute
          </span>
          <span className="font-mono text-body text-polar-white">
            {dispute?.dispute_id ?? "·"}
          </span>
          {dispute && (
            <span className="hidden t-body text-dim md:inline">
              · {dispute.scenario_id ?? "schema-less"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-micro text-ash-gray">
          {dispute && <RoundBadge dispute={dispute} />}
          {dispute && <TurnBadge dispute={dispute} />}
          <ConnectionBadge online={online} />
        </div>
      </div>
      {dispute?.finalized && (
        <div className="mt-3 flex flex-wrap items-center gap-2 t-body text-dim">
          <span className="text-ash-gray">root_hash</span>
          <span className="font-mono text-bone">
            sha256:{shortHash(dispute.finalized.root_hash, 32)}…
          </span>
        </div>
      )}
    </header>
  );
}

function RoundBadge({ dispute }: { dispute: DisputeDump }) {
  const segments = Array.from({ length: dispute.max_rounds }, (_, i) => i + 1);
  return (
    <div className="flex items-center gap-2">
      <span className="text-ash-gray">round</span>
      <div className="flex items-center gap-1">
        {segments.map((r) => {
          const active = r === dispute.current_round && !dispute.finalized;
          const past = r < dispute.current_round || dispute.finalized;
          return (
            <span
              key={r}
              className={[
                "h-1.5 w-4 rounded-full transition-colors",
                active
                  ? "bg-amber-glow"
                  : past
                    ? "bg-polar-white/40"
                    : "bg-line",
              ].join(" ")}
            />
          );
        })}
      </div>
      <span className="font-mono tabular text-bone">
        {dispute.current_round}/{dispute.max_rounds}
      </span>
    </div>
  );
}

function TurnBadge({ dispute }: { dispute: DisputeDump }) {
  if (dispute.finalized) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill border border-amber-glow/30 bg-amber-glow/10 px-2 py-0.5 text-micro tracking-[0.05em] text-amber-glow">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-glow" />
        finalized
      </span>
    );
  }
  const turn = dispute.turn;
  const tone =
    turn === "aria"
      ? "border-aria/40 bg-aria/10 text-aria"
      : "border-atlas/40 bg-atlas/10 text-atlas";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-micro tracking-[0.05em] ${tone}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          turn === "aria" ? "bg-aria" : "bg-atlas"
        }`}
      />
      {turn} thinking
    </span>
  );
}

function ConnectionBadge({ online }: { online: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-micro",
        online
          ? "border-pulse-green/40 bg-pulse-green/10 text-pulse-green"
          : "border-warn-red/40 bg-warn-red/10 text-warn-red",
      ].join(" ")}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${online ? "bg-pulse-green" : "bg-warn-red"}`}
      />
      {online ? "live" : "offline"}
    </span>
  );
}
