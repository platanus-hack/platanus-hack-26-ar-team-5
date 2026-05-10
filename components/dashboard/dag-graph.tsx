"use client";

import type {
  AgentRole,
  DisputeDump,
  DumpMessage,
  DumpSignedRuling,
  DumpSignedVote,
  RulingOutcome,
} from "./types";
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
  Withdraw: { label: "Withdraw", color: "#E25B5B", icon: "✕" },
};

const VOTE_COLOR_BY_OUTCOME: Record<RulingOutcome, string> = {
  claimant_prevails: "#A4F4FD",
  claimant_partial: "#C084FC",
  respondent_prevails: "#7AA2F7",
  abstain: "#E25B5B",
};

const VOTE_COLOR_FALLBACK = "#C084FC";
const RULING_COLOR = "#C084FC";

type Lane = "aria" | "atlas" | "tribunal";

type LaidNode =
  | {
      kind: "msg";
      id: string;
      hash: string;
      lane: AgentRole;
      type: DumpMessage["type"];
      round: number;
      ref: string;
      cx: number;
      cy: number;
      parentHashes: string[];
    }
  | {
      kind: "vote";
      id: string;
      lane: "tribunal";
      juror: string;
      model: string;
      outcome: RulingOutcome;
      confidence: number;
      cx: number;
      cy: number;
    }
  | {
      kind: "ruling";
      id: string;
      lane: "tribunal";
      outcome: RulingOutcome;
      confidence: number;
      cx: number;
      cy: number;
    };

type LaidEdge = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  tone?: "default" | "tribunal" | "final";
};

const NODE_R = 22;
const HORIZ_PAD = 116;
const LANE_GAP = 110;
const COL_W = 100;
const TOP_PAD = 60;
const LABEL_OFFSET = NODE_R + 24;
const LANE_LABEL_X = 16;
const LANE_DIVIDER_X = HORIZ_PAD - 30;

const LANE_Y: Record<Lane, number> = {
  aria: TOP_PAD,
  atlas: TOP_PAD + LANE_GAP,
  tribunal: TOP_PAD + LANE_GAP * 2,
};

export function DagGraph({ dispute }: Props) {
  const ariaDid = dispute.agents.aria;
  const items = dispute.history;

  // Bilateral message nodes
  const msgNodes: LaidNode[] = items.map((m, i) => {
    const lane: AgentRole = m.from_agent === ariaDid ? "aria" : "atlas";
    const cx = HORIZ_PAD + i * COL_W;
    const cy = LANE_Y[lane];
    return {
      kind: "msg",
      id: m.msg_id,
      hash: m.hash,
      lane,
      type: m.type,
      round: m.round,
      ref: m.ref,
      cx,
      cy,
      parentHashes: m.parent_refs ?? [],
    };
  });

  const byHash = new Map<string, LaidNode>();
  for (const n of msgNodes) {
    if (n.kind === "msg") byHash.set(n.hash, n);
  }

  const edges: LaidEdge[] = [];
  for (const n of msgNodes) {
    if (n.kind !== "msg") continue;
    for (const p of n.parentHashes) {
      const parent = byHash.get(p);
      if (!parent || parent.kind !== "msg") continue;
      edges.push({
        from: { x: parent.cx, y: parent.cy },
        to: { x: n.cx, y: n.cy },
      });
    }
  }

  const ruling = dispute.ruling ?? extractRulingFromBundle(dispute.finalized);
  const showTribunal = !!ruling && ruling.votes.length > 0;

  const tribunalNodes: LaidNode[] = [];
  if (showTribunal && ruling) {
    const baseCol = msgNodes.length;
    ruling.votes.forEach((v, i) => {
      tribunalNodes.push({
        kind: "vote",
        id: `vote-${v.juror_did}-${i}`,
        lane: "tribunal",
        juror: v.juror,
        model: v.juror_model,
        outcome: v.outcome,
        confidence: v.confidence,
        cx: HORIZ_PAD + (baseCol + i) * COL_W,
        cy: LANE_Y.tribunal,
      });
    });
    // Ruling node sits one column past the last vote
    const rulingCx = HORIZ_PAD + (baseCol + ruling.votes.length) * COL_W;
    tribunalNodes.push({
      kind: "ruling",
      id: "ruling-node",
      lane: "tribunal",
      outcome: ruling.ruling.outcome,
      confidence: ruling.ruling.confidence,
      cx: rulingCx,
      cy: LANE_Y.tribunal,
    });

    // Edges: last bilateral message → each vote
    if (msgNodes.length > 0) {
      const last = msgNodes[msgNodes.length - 1]!;
      for (const v of tribunalNodes) {
        if (v.kind !== "vote") continue;
        edges.push({
          from: { x: last.cx, y: last.cy },
          to: { x: v.cx, y: v.cy },
          tone: "tribunal",
        });
      }
    }
    // Edges: each vote → ruling
    const rulingNode = tribunalNodes.find((n) => n.kind === "ruling")!;
    for (const v of tribunalNodes) {
      if (v.kind !== "vote") continue;
      edges.push({
        from: { x: v.cx, y: v.cy },
        to: { x: rulingNode.cx, y: rulingNode.cy },
        tone: "tribunal",
      });
    }
  }

  // Compute root position and final edge
  const finalized = !!dispute.finalized;
  const allNodes: LaidNode[] = [...msgNodes, ...tribunalNodes];
  const rightmostX =
    allNodes.length > 0
      ? Math.max(...allNodes.map((n) => n.cx))
      : HORIZ_PAD;
  const rootX = rightmostX + COL_W + 12;
  const rootY = showTribunal
    ? LANE_Y.tribunal
    : TOP_PAD + LANE_GAP / 2;

  if (finalized) {
    if (showTribunal) {
      const rulingNode = tribunalNodes.find((n) => n.kind === "ruling");
      if (rulingNode) {
        edges.push({
          from: { x: rulingNode.cx, y: rulingNode.cy },
          to: { x: rootX, y: rootY },
          tone: "final",
        });
      }
    } else if (msgNodes.length > 0) {
      const last = msgNodes[msgNodes.length - 1]!;
      edges.push({
        from: { x: last.cx, y: last.cy },
        to: { x: rootX, y: rootY },
        tone: "final",
      });
    }
  }

  const width = Math.max(540, rootX + HORIZ_PAD);
  const bottomLane = showTribunal ? LANE_Y.tribunal : LANE_Y.atlas;
  const height = bottomLane + LABEL_OFFSET + 28;

  return (
    <section className="overflow-hidden rounded-lg border border-line/70 bg-graphite/30">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line/70 px-4 py-3">
        <div className="t-body uppercase tracking-[0.2em] text-ash-gray">
          Audit DAG
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-bone">
          {(
            [
              "Propose",
              "CounterPropose",
              "Reveal",
              "Accept",
              "Critique",
              "Escalate",
              "Withdraw",
            ] as const
          ).map((t) => (
            <Legend key={t} label={TYPE_INFO[t].label} color={TYPE_INFO[t].color} />
          ))}
          {showTribunal && <Legend label="Vote" color={RULING_COLOR} />}
          {showTribunal && <Legend label="Ruling" color={RULING_COLOR} ringed />}
          {finalized && <Legend label="Root" color="#E7C59A" outline />}
        </div>
      </div>

      {msgNodes.length === 0 ? (
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
            aria-label="Signed audit DAG of every protocol move plus tribunal"
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
              <radialGradient id="aurora-vote" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={RULING_COLOR} stopOpacity="0.55" />
                <stop offset="60%" stopColor={RULING_COLOR} stopOpacity="0.12" />
                <stop offset="100%" stopColor={RULING_COLOR} stopOpacity="0" />
              </radialGradient>
              <radialGradient id="aurora-ruling" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={RULING_COLOR} stopOpacity="0.7" />
                <stop offset="60%" stopColor={RULING_COLOR} stopOpacity="0.18" />
                <stop offset="100%" stopColor={RULING_COLOR} stopOpacity="0" />
              </radialGradient>
              <radialGradient id="aurora-root" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#E7C59A" stopOpacity="0.7" />
                <stop offset="60%" stopColor="#E7C59A" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#E7C59A" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Lane labels */}
            <LaneLabel y={LANE_Y.aria} kicker="CLAIMANT" name="Aria" color="var(--color-aria)" />
            <LaneLabel y={LANE_Y.atlas} kicker="RESPONDENT" name="Atlas" color="var(--color-atlas)" />
            {showTribunal && (
              <LaneLabel
                y={LANE_Y.tribunal}
                kicker="ARBITER"
                name="Tribunal"
                color={RULING_COLOR}
              />
            )}

            <line
              x1={LANE_DIVIDER_X}
              x2={LANE_DIVIDER_X}
              y1={TOP_PAD - 30}
              y2={bottomLane + 18}
              stroke="var(--color-line-soft)"
              strokeWidth="1"
            />

            {/* Lane guides (dashed) */}
            <LaneGuide y={LANE_Y.aria} width={width} />
            <LaneGuide y={LANE_Y.atlas} width={width} />
            {showTribunal && <LaneGuide y={LANE_Y.tribunal} width={width} />}

            {/* Edges (drawn first, behind nodes) */}
            {edges.map((e, i) => (
              <path
                key={i}
                d={curvedPath(e.from, e.to)}
                fill="none"
                stroke={
                  e.tone === "final"
                    ? "#E7C59A"
                    : e.tone === "tribunal"
                      ? RULING_COLOR
                      : "var(--color-line)"
                }
                strokeWidth={e.tone === "final" ? "1.6" : "1.2"}
                strokeOpacity={
                  e.tone === "final" ? 0.9 : e.tone === "tribunal" ? 0.55 : 0.7
                }
                strokeDasharray={e.tone === "tribunal" ? "3 4" : undefined}
              />
            ))}

            {/* Nodes */}
            {msgNodes.map((n) =>
              n.kind === "msg" ? <MsgNode key={n.id} n={n} /> : null,
            )}
            {tribunalNodes.map((n) => {
              if (n.kind === "vote") return <VoteNode key={n.id} n={n} />;
              if (n.kind === "ruling") return <RulingNode key={n.id} n={n} />;
              return null;
            })}

            {finalized && msgNodes.length > 0 && (
              <RootNode cx={rootX} cy={rootY} />
            )}
          </svg>
        </div>
      )}
    </section>
  );
}

function extractRulingFromBundle(
  bundle: DisputeDump["finalized"],
): { votes: DumpSignedVote[]; ruling: DumpSignedRuling } | null {
  if (!bundle) return null;
  if (bundle.outcome.kind !== "ruling") return null;
  return { votes: bundle.outcome.votes, ruling: bundle.outcome.ruling };
}

function LaneLabel({
  y,
  kicker,
  name,
  color,
}: {
  y: number;
  kicker: string;
  name: string;
  color: string;
}) {
  return (
    <g>
      <text
        x={LANE_LABEL_X}
        y={y - 18}
        fill="var(--color-dim)"
        fontSize="9"
        fontWeight="500"
        letterSpacing="0.18em"
      >
        {kicker}
      </text>
      <text
        x={LANE_LABEL_X}
        y={y + 4}
        fill={color}
        fontSize="14"
        fontWeight="600"
      >
        {name}
      </text>
    </g>
  );
}

function LaneGuide({ y, width }: { y: number; width: number }) {
  return (
    <line
      x1={HORIZ_PAD - 14}
      x2={width - HORIZ_PAD + 14}
      y1={y}
      y2={y}
      stroke="var(--color-line-soft)"
      strokeWidth="1"
      strokeDasharray="2 5"
    />
  );
}

function MsgNode({ n }: { n: Extract<LaidNode, { kind: "msg" }> }) {
  const info = TYPE_INFO[n.type];
  return (
    <g>
      <title>
        {info.label} · round {n.round} · {n.ref} · #{shortHash(n.hash, 10)}
      </title>
      <circle
        cx={n.cx}
        cy={n.cy}
        r={NODE_R + 22}
        fill={`url(#aurora-${n.type})`}
      />
      <circle cx={n.cx} cy={n.cy} r={NODE_R} fill={info.color} />
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

const VOTE_OUTCOME_LABEL: Record<RulingOutcome, string> = {
  claimant_prevails: "claimant",
  claimant_partial: "partial",
  respondent_prevails: "respondent",
  abstain: "abstain",
};

function VoteNode({ n }: { n: Extract<LaidNode, { kind: "vote" }> }) {
  const fill = VOTE_COLOR_BY_OUTCOME[n.outcome] ?? VOTE_COLOR_FALLBACK;
  const confPct = `${(n.confidence * 100).toFixed(0)}%`;
  return (
    <g>
      <title>
        {n.juror} ({n.model}) — vote: {n.outcome}, confidence {confPct}
      </title>
      <circle cx={n.cx} cy={n.cy} r={NODE_R + 22} fill="url(#aurora-vote)" />
      <circle cx={n.cx} cy={n.cy} r={NODE_R} fill={fill} />
      <text
        x={n.cx}
        y={n.cy + 5}
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="var(--color-deep-space)"
      >
        ⚖
      </text>
      <text
        x={n.cx}
        y={n.cy + LABEL_OFFSET}
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill="var(--color-polar-white)"
      >
        {n.juror}
      </text>
      <text
        x={n.cx}
        y={n.cy + LABEL_OFFSET + 14}
        textAnchor="middle"
        fontSize="10"
        fill="var(--color-dim)"
      >
        {VOTE_OUTCOME_LABEL[n.outcome] ?? n.outcome} · {confPct}
      </text>
    </g>
  );
}

function RulingNode({ n }: { n: Extract<LaidNode, { kind: "ruling" }> }) {
  const fill = VOTE_COLOR_BY_OUTCOME[n.outcome] ?? RULING_COLOR;
  const confPct = `${(n.confidence * 100).toFixed(0)}%`;
  return (
    <g>
      <title>
        Tribunal ruling — {n.outcome} · compound confidence {confPct}
      </title>
      <circle
        cx={n.cx}
        cy={n.cy}
        r={NODE_R + 26}
        fill="url(#aurora-ruling)"
      />
      <circle
        cx={n.cx}
        cy={n.cy}
        r={NODE_R + 4}
        fill={fill}
        stroke={RULING_COLOR}
        strokeWidth="1.5"
      />
      <text
        x={n.cx}
        y={n.cy + 6}
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        fill="var(--color-deep-space)"
      >
        §
      </text>
      <text
        x={n.cx}
        y={n.cy + LABEL_OFFSET + 4}
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill={RULING_COLOR}
      >
        Ruling
      </text>
      <text
        x={n.cx}
        y={n.cy + LABEL_OFFSET + 18}
        textAnchor="middle"
        fontSize="10"
        fill="var(--color-dim)"
      >
        {VOTE_OUTCOME_LABEL[n.outcome] ?? n.outcome} · {confPct}
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
  ringed = false,
}: {
  label: string;
  color: string;
  outline?: boolean;
  ringed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 t-body">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={
          outline
            ? { background: "transparent", boxShadow: `inset 0 0 0 1.5px ${color}` }
            : ringed
              ? { background: color, boxShadow: `0 0 0 2px ${color}40` }
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
