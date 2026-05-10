"use client";

import type { AgentRole, DisputeDump, DumpProposeMsg } from "./types";

type Props = {
  dispute: DisputeDump;
};

type Point = { round: number; aria?: number; atlas?: number };

function buildPoints(dispute: DisputeDump): Point[] {
  const rounds = Math.max(dispute.current_round, 1);
  const points: Point[] = [];
  for (let r = 1; r <= Math.max(rounds, dispute.max_rounds); r++) {
    points.push({ round: r });
  }
  const ariaDid = dispute.agents.aria;
  const atlasDid = dispute.agents.atlas;
  for (const m of dispute.history) {
    if (m.type !== "Propose" && m.type !== "CounterPropose") continue;
    const role: AgentRole = m.from_agent === ariaDid ? "aria" : "atlas";
    const u = (m as DumpProposeMsg).payload.utility_for_self;
    const slot = points[m.round - 1];
    if (slot) slot[role] = u;
  }
  return points;
}

const W = 560;
const H = 180;
const PAD_LEFT = 36;
const PAD_RIGHT = 16;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

export function UtilityChart({ dispute }: Props) {
  const points = buildPoints(dispute);
  const maxRound = Math.max(dispute.max_rounds, points.length);
  const innerW = W - PAD_LEFT - PAD_RIGHT;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const xOf = (r: number) =>
    PAD_LEFT + (maxRound > 1 ? ((r - 1) / (maxRound - 1)) * innerW : innerW / 2);
  const yOf = (u: number) => PAD_TOP + (1 - clamp01(u)) * innerH;

  const ariaPoints = points
    .filter((p) => p.aria !== undefined)
    .map((p) => ({ x: xOf(p.round), y: yOf(p.aria!), r: p.round, u: p.aria! }));
  const atlasPoints = points
    .filter((p) => p.atlas !== undefined)
    .map((p) => ({ x: xOf(p.round), y: yOf(p.atlas!), r: p.round, u: p.atlas! }));

  const ariaPath = pathFrom(ariaPoints);
  const atlasPath = pathFrom(atlasPoints);

  return (
    <section className="rounded-lg border border-line/70 bg-graphite/40">
      <div className="flex items-center justify-between border-b border-line/70 px-4 py-2.5">
        <div className="text-micro uppercase tracking-[0.2em] text-ash-gray">
          Compromise bound
        </div>
        <div className="flex items-center gap-3 text-micro text-dim">
          <Legend label="aria" tone="aria" />
          <Legend label="atlas" tone="atlas" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-[180px] w-full min-w-[560px]"
          role="img"
          aria-label="Utility per side over rounds"
        >
          <YAxis />
          <XAxis maxRound={maxRound} xOf={xOf} />
          {ariaPath && (
            <path
              d={ariaPath}
              fill="none"
              stroke="var(--color-aria)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {atlasPath && (
            <path
              d={atlasPath}
              fill="none"
              stroke="var(--color-atlas)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {ariaPoints.map((p) => (
            <Dot key={`a-${p.r}`} x={p.x} y={p.y} fill="var(--color-aria)" />
          ))}
          {atlasPoints.map((p) => (
            <Dot key={`b-${p.r}`} x={p.x} y={p.y} fill="var(--color-atlas)" />
          ))}
          <CurrentRoundMarker
            current={dispute.current_round}
            maxRound={maxRound}
            xOf={xOf}
            finalized={!!dispute.finalized}
          />
        </svg>
      </div>
      <div className="border-t border-line/50 px-4 py-2 text-micro text-dim">
        Each agent&apos;s utility-for-self is monotonically non-increasing. The
        gap closes as the deal narrows.
      </div>
    </section>
  );
}

function pathFrom(pts: Array<{ x: number; y: number }>): string | null {
  if (pts.length === 0) return null;
  const head = pts[0]!;
  let d = `M ${head.x.toFixed(1)} ${head.y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i]!.x.toFixed(1)} ${pts[i]!.y.toFixed(1)}`;
  }
  return d;
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function YAxis() {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const yOf = (u: number) => PAD_TOP + (1 - u) * innerH;
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD_LEFT}
            x2={W - PAD_RIGHT}
            y1={yOf(t)}
            y2={yOf(t)}
            stroke="var(--color-line-soft)"
            strokeWidth="1"
            strokeDasharray={t === 0 || t === 1 ? "none" : "2 4"}
          />
          <text
            x={PAD_LEFT - 6}
            y={yOf(t) + 3}
            textAnchor="end"
            className="font-mono"
            fontSize="9"
            fill="var(--color-dim)"
          >
            {t.toFixed(2)}
          </text>
        </g>
      ))}
    </g>
  );
}

function XAxis({
  maxRound,
  xOf,
}: {
  maxRound: number;
  xOf: (r: number) => number;
}) {
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);
  return (
    <g>
      {rounds.map((r) => (
        <g key={r}>
          <line
            x1={xOf(r)}
            x2={xOf(r)}
            y1={H - PAD_BOTTOM}
            y2={H - PAD_BOTTOM + 4}
            stroke="var(--color-dim)"
            strokeWidth="1"
          />
          <text
            x={xOf(r)}
            y={H - PAD_BOTTOM + 14}
            textAnchor="middle"
            className="font-mono"
            fontSize="9"
            fill="var(--color-dim)"
          >
            r{r}
          </text>
        </g>
      ))}
    </g>
  );
}

function Dot({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="3.2" fill={fill} />
      <circle cx={x} cy={y} r="6" fill={fill} opacity="0.18" />
    </g>
  );
}

function CurrentRoundMarker({
  current,
  maxRound,
  xOf,
  finalized,
}: {
  current: number;
  maxRound: number;
  xOf: (r: number) => number;
  finalized: boolean;
}) {
  if (finalized) return null;
  const r = Math.min(Math.max(current, 1), maxRound);
  const x = xOf(r);
  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={PAD_TOP}
        y2={H - PAD_BOTTOM}
        stroke="var(--color-amber-glow)"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.55"
      />
    </g>
  );
}

function Legend({ label, tone }: { label: string; tone: "aria" | "atlas" }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono">
      <span
        className={`h-1.5 w-3 rounded-sm ${
          tone === "aria" ? "bg-aria" : "bg-atlas"
        }`}
      />
      {label}
    </span>
  );
}
