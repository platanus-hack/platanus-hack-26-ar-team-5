"use client";

import type { AgentRole, DisputeDump, DumpMessage } from "./types";
import { shortHash } from "./format";

type Props = {
  dispute: DisputeDump;
};

const TYPE_INFO: Record<
  DumpMessage["type"],
  { label: string; color: string; icon: string }
> = {
  Propose: { label: "Propose", color: "#A4F4FD", icon: "·" },
  CounterPropose: { label: "Counter", color: "#7AA2F7", icon: "↺" },
  Critique: { label: "Critique", color: "#E25B5B", icon: "?" },
  Reveal: { label: "Reveal", color: "#2FBF71", icon: "◉" },
  Accept: { label: "Accept", color: "#E7C59A", icon: "✓" },
  Escalate: { label: "Escalate", color: "#FF7A59", icon: "↗" },
};

type LaidNode = {
  id: string;
  hash: string;
  role: AgentRole;
  type: DumpMessage["type"];
  round: number;
  ref: string;
  cx: number;
  cy: number;
  parentHashes: string[];
};

type LaidEdge = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  finalEdge?: boolean;
};

const NODE_R = 22;
const HORIZ_PAD = 116;
const LANE_GAP = 130;
const COL_W = 100;
const TOP_PAD = 60;
const LABEL_OFFSET = NODE_R + 24;
const LANE_LABEL_X = 16;
const LANE_DIVIDER_X = HORIZ_PAD - 30;

export function DagGraph({ dispute }: Props) {
  const ariaDid = dispute.agents.aria;
  const items = dispute.history;

  const nodes: LaidNode[] = items.map((m, i) => {
    const role: AgentRole = m.from_agent === ariaDid ? "aria" : "atlas";
    const cx = HORIZ_PAD + i * COL_W;
    const cy = role === "aria" ? TOP_PAD : TOP_PAD + LANE_GAP;
    return {
      id: m.msg_id,
      hash: m.hash,
      role,
      type: m.type,
      round: m.round,
      ref: m.ref,
      cx,
      cy,
      parentHashes: m.parent_refs ?? [],
    };
  });

  const byHash = new Map<string, LaidNode>();
  for (const n of nodes) byHash.set(n.hash, n);

  const edges: LaidEdge[] = [];
  for (const n of nodes) {
    for (const p of n.parentHashes) {
      const parent = byHash.get(p);
      if (!parent) continue;
      edges.push({
        from: { x: parent.cx, y: parent.cy },
        to: { x: n.cx, y: n.cy },
      });
    }
  }

  const lastX =
    nodes.length > 0 ? nodes[nodes.length - 1]!.cx + COL_W + 12 : HORIZ_PAD;
  const rootCenterY = TOP_PAD + LANE_GAP / 2;
  const finalized = !!dispute.finalized;
  if (finalized && nodes.length > 0) {
    const last = nodes[nodes.length - 1]!;
    edges.push({
      from: { x: last.cx, y: last.cy },
      to: { x: lastX, y: rootCenterY },
      finalEdge: true,
    });
  }

  const width = Math.max(540, lastX + HORIZ_PAD);
  const height = TOP_PAD + LANE_GAP + LABEL_OFFSET + 28;

  return (
    <section className="overflow-hidden rounded-lg border border-line/70 bg-graphite/30">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line/70 px-4 py-3">
        <div className="t-body uppercase tracking-[0.2em] text-ash-gray">
          Audit DAG
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-bone">
          {(
            ["Propose", "CounterPropose", "Reveal", "Accept", "Critique", "Escalate"] as const
          ).map((t) => (
            <Legend key={t} label={TYPE_INFO[t].label} color={TYPE_INFO[t].color} />
          ))}
          {finalized && <Legend label="Root" color="#E7C59A" outline />}
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="px-4 py-10 text-center t-body text-dim">
          The graph builds as the first signed move lands.
        </div>
      ) : (
        <div className="overflow-x-auto px-2 py-3">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            role="img"
            aria-label="Signed audit DAG of every protocol move"
            className="block"
            style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
          >
            <defs>
              {Object.entries(TYPE_INFO).map(([k, v]) => (
                <radialGradient
                  key={k}
                  id={`aurora-${k}`}
                  cx="50%"
                  cy="50%"
                  r="50%"
                >
                  <stop offset="0%" stopColor={v.color} stopOpacity="0.55" />
                  <stop offset="60%" stopColor={v.color} stopOpacity="0.12" />
                  <stop offset="100%" stopColor={v.color} stopOpacity="0" />
                </radialGradient>
              ))}
              <radialGradient id="aurora-root" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#E7C59A" stopOpacity="0.7" />
                <stop offset="60%" stopColor="#E7C59A" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#E7C59A" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Lane labels (own column, never overlap nodes) */}
            <g>
              <text
                x={LANE_LABEL_X}
                y={TOP_PAD - 18}
                fill="var(--color-dim)"
                fontSize="9"
                fontWeight="500"
                letterSpacing="0.18em"
              >
                CLAIMANT
              </text>
              <text
                x={LANE_LABEL_X}
                y={TOP_PAD + 4}
                fill="var(--color-aria)"
                fontSize="14"
                fontWeight="600"
              >
                Aria
              </text>
            </g>
            <g>
              <text
                x={LANE_LABEL_X}
                y={TOP_PAD + LANE_GAP - 18}
                fill="var(--color-dim)"
                fontSize="9"
                fontWeight="500"
                letterSpacing="0.18em"
              >
                RESPONDENT
              </text>
              <text
                x={LANE_LABEL_X}
                y={TOP_PAD + LANE_GAP + 4}
                fill="var(--color-atlas)"
                fontSize="14"
                fontWeight="600"
              >
                Atlas
              </text>
            </g>
            <line
              x1={LANE_DIVIDER_X}
              x2={LANE_DIVIDER_X}
              y1={TOP_PAD - 30}
              y2={TOP_PAD + LANE_GAP + 18}
              stroke="var(--color-line-soft)"
              strokeWidth="1"
            />

            {/* Lane guides (dashed) */}
            <line
              x1={HORIZ_PAD - 14}
              x2={width - HORIZ_PAD + 14}
              y1={TOP_PAD}
              y2={TOP_PAD}
              stroke="var(--color-line-soft)"
              strokeWidth="1"
              strokeDasharray="2 5"
            />
            <line
              x1={HORIZ_PAD - 14}
              x2={width - HORIZ_PAD + 14}
              y1={TOP_PAD + LANE_GAP}
              y2={TOP_PAD + LANE_GAP}
              stroke="var(--color-line-soft)"
              strokeWidth="1"
              strokeDasharray="2 5"
            />

            {/* Edges (drawn first, behind nodes) */}
            {edges.map((e, i) => (
              <path
                key={i}
                d={curvedPath(e.from, e.to)}
                fill="none"
                stroke={e.finalEdge ? "#E7C59A" : "var(--color-line)"}
                strokeWidth={e.finalEdge ? "1.6" : "1.2"}
                strokeOpacity={e.finalEdge ? 0.9 : 0.7}
              />
            ))}

            {/* Nodes */}
            {nodes.map((n) => (
              <Node key={n.id} n={n} />
            ))}

            {finalized && nodes.length > 0 && (
              <RootNode cx={lastX} cy={rootCenterY} />
            )}
          </svg>
        </div>
      )}
    </section>
  );
}

function Node({ n }: { n: LaidNode }) {
  const info = TYPE_INFO[n.type];
  return (
    <g>
      <title>
        {info.label} · round {n.round} · {n.ref} · #{shortHash(n.hash, 10)}
      </title>

      {/* Aurora glow (per type) */}
      <circle
        cx={n.cx}
        cy={n.cy}
        r={NODE_R + 22}
        fill={`url(#aurora-${n.type})`}
      />

      {/* Solid node */}
      <circle cx={n.cx} cy={n.cy} r={NODE_R} fill={info.color} />

      {/* Inner icon */}
      <text
        x={n.cx}
        y={n.cy + 5}
        textAnchor="middle"
        fontSize="15"
        fontWeight="600"
        fill="var(--color-deep-space)"
      >
        {info.icon}
      </text>

      {/* Label below node */}
      <text
        x={n.cx}
        y={n.cy + LABEL_OFFSET}
        textAnchor="middle"
        fontSize="12"
        fontWeight="500"
        fill="var(--color-polar-white)"
      >
        {info.label}
      </text>

      {/* Sub-label: round + ref */}
      <text
        x={n.cx}
        y={n.cy + LABEL_OFFSET + 14}
        textAnchor="middle"
        fontSize="10"
        fill="var(--color-dim)"
      >
        r{n.round} · {n.ref}
      </text>
    </g>
  );
}

function RootNode({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <title>Bundle root_hash. sha-256 over the whole DAG.</title>
      <circle cx={cx} cy={cy} r={NODE_R + 22} fill="url(#aurora-root)" />
      <circle cx={cx} cy={cy} r={NODE_R + 4} fill="#E7C59A" />
      <text
        x={cx}
        y={cy + 6}
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        fill="var(--color-deep-space)"
      >
        ⚿
      </text>
      <text
        x={cx}
        y={cy + LABEL_OFFSET + 4}
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill="#E7C59A"
      >
        Root
      </text>
      <text
        x={cx}
        y={cy + LABEL_OFFSET + 18}
        textAnchor="middle"
        fontSize="10"
        fill="var(--color-dim)"
      >
        signed bundle
      </text>
    </g>
  );
}

function Legend({
  label,
  color,
  outline = false,
}: {
  label: string;
  color: string;
  outline?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 t-body">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={
          outline
            ? { background: "transparent", boxShadow: `inset 0 0 0 1.5px ${color}` }
            : { background: color }
        }
      />
      {label}
    </span>
  );
}

function curvedPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const dx = to.x - from.x;
  const sameLane = from.y === to.y;
  if (sameLane) {
    return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} L ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
  }
  const cx1 = from.x + dx * 0.55;
  const cx2 = to.x - dx * 0.55;
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} C ${cx1.toFixed(1)} ${from.y.toFixed(1)}, ${cx2.toFixed(1)} ${to.y.toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}
