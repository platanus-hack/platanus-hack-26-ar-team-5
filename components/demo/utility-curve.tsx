"use client";

export type UtilityPoint = { round: number; aria?: number; atlas?: number };

const W = 320;
const H = 120;
const PAD_X = 18;
const PAD_Y = 14;

function buildPath(values: Array<{ round: number; v: number }>) {
  if (values.length === 0) return "";
  const xs = values.length === 1 ? [PAD_X + (W - PAD_X * 2) / 2] : null;
  return values
    .map((p, i) => {
      const x = xs
        ? xs[i]!
        : PAD_X + ((W - PAD_X * 2) * i) / (values.length - 1);
      const y = H - PAD_Y - p.v * (H - PAD_Y * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function UtilityCurve({ points }: { points: UtilityPoint[] }) {
  const aria = points
    .filter((p): p is UtilityPoint & { aria: number } => typeof p.aria === "number")
    .map((p) => ({ round: p.round, v: p.aria }));
  const atlas = points
    .filter((p): p is UtilityPoint & { atlas: number } => typeof p.atlas === "number")
    .map((p) => ({ round: p.round, v: p.atlas }));

  return (
    <div className="rounded-lg border border-dark-carbon bg-deep-space p-5">
      <div className="flex items-center justify-between">
        <span className="font-input text-caption uppercase tracking-tight text-ash-gray">
          utility per round
        </span>
        <span className="font-input text-caption text-dark-carbon">0 → 1</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Utility curve over rounds"
        className="mt-3 block w-full h-auto"
      >
        {/* Grid */}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={H - PAD_Y}
          y2={H - PAD_Y}
          stroke="var(--color-dark-carbon)"
          strokeWidth={1}
        />
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={PAD_Y}
          y2={PAD_Y}
          stroke="var(--color-dark-carbon)"
          strokeDasharray="2 4"
          strokeWidth={1}
        />
        {/* Aria line (amber) */}
        {aria.length > 0 ? (
          <path
            d={buildPath(aria)}
            fill="none"
            stroke="var(--color-amber-glow)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {aria.map((p, i) => (
          <circle
            key={`a-${i}`}
            cx={
              aria.length === 1
                ? PAD_X + (W - PAD_X * 2) / 2
                : PAD_X + ((W - PAD_X * 2) * i) / (aria.length - 1)
            }
            cy={H - PAD_Y - p.v * (H - PAD_Y * 2)}
            r={2.5}
            fill="var(--color-amber-glow)"
          />
        ))}
        {/* Atlas line (slate) */}
        {atlas.length > 0 ? (
          <path
            d={buildPath(atlas)}
            fill="none"
            stroke="var(--color-slate)"
            strokeWidth={2}
            strokeDasharray="3 3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {atlas.map((p, i) => (
          <circle
            key={`b-${i}`}
            cx={
              atlas.length === 1
                ? PAD_X + (W - PAD_X * 2) / 2
                : PAD_X + ((W - PAD_X * 2) * i) / (atlas.length - 1)
            }
            cy={H - PAD_Y - p.v * (H - PAD_Y * 2)}
            r={2.5}
            fill="var(--color-slate)"
          />
        ))}
      </svg>
      <div className="mt-3 flex items-center gap-5 font-input text-caption">
        <span className="inline-flex items-center gap-2 text-ash-gray">
          <span className="inline-block h-[2px] w-5 bg-amber-glow" /> aria
        </span>
        <span className="inline-flex items-center gap-2 text-ash-gray">
          <span className="inline-block h-[2px] w-5 bg-slate" /> atlas
        </span>
      </div>
    </div>
  );
}
