"use client";

const TIER_COLOR: Record<string, string> = {
  S: "bg-neon-green",
  A: "bg-amber-glow",
  B: "bg-slate",
  C: "bg-ash-gray",
};

function shortHash(h: string) {
  return h.length > 18 ? `${h.slice(0, 14)}…${h.slice(-2)}` : h;
}

export function EvidenceLedger({
  items,
}: {
  items: Array<{ id: string; tier: string; hash: string }>;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dark-carbon bg-deep-space p-5">
        <span className="font-input text-caption uppercase tracking-tight text-ash-gray">
          evidence ledger
        </span>
        <div className="mt-4 space-y-2" aria-live="polite">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-6 rounded-sm border border-dark-carbon bg-midnight-void pacta-shimmer"
            />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dark-carbon bg-deep-space p-5">
      <div className="flex items-center justify-between">
        <span className="font-input text-caption uppercase tracking-tight text-ash-gray">
          evidence ledger
        </span>
        <span className="font-input text-caption text-dark-carbon">
          {items.length} signed
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((e) => (
          <li
            key={e.hash}
            className="flex items-center gap-3 font-input text-caption text-ash-gray"
          >
            <span
              aria-hidden
              className={[
                "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold text-midnight-void",
                TIER_COLOR[e.tier] ?? "bg-dark-carbon",
              ].join(" ")}
              title={`tier ${e.tier}`}
            >
              {e.tier}
            </span>
            <span className="text-polar-white">{e.id}</span>
            <span className="ml-auto text-dark-carbon">{shortHash(e.hash)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
