"use client";

import type {
  AgentRole,
  DisputeDump,
  DumpAcceptMsg,
  DumpCritiqueMsg,
  DumpEscalateMsg,
  DumpMessage,
  DumpProposeMsg,
  DumpRevealMsg,
} from "./types";
import { shortHash, timeOfDay } from "./format";

type Props = {
  dispute: DisputeDump;
};

const TYPE_TONE: Record<DumpMessage["type"], { label: string; cls: string }> = {
  Propose: {
    label: "Propose",
    cls: "border-aria/30 bg-aria/5 text-aria",
  },
  CounterPropose: {
    label: "Counter",
    cls: "border-atlas/30 bg-atlas/5 text-atlas",
  },
  Critique: {
    label: "Critique",
    cls: "border-warn-red/30 bg-warn-red/5 text-warn-red",
  },
  Accept: {
    label: "Accept",
    cls: "border-amber-glow/30 bg-amber-glow/5 text-amber-glow",
  },
  Reveal: {
    label: "Reveal",
    cls: "border-pulse-green/30 bg-pulse-green/5 text-pulse-green",
  },
  Escalate: {
    label: "Escalate",
    cls: "border-warn-red/40 bg-warn-red/10 text-warn-red",
  },
};

export function Timeline({ dispute }: Props) {
  const items = dispute.history;
  const ariaDid = dispute.agents.aria;
  return (
    <section className="rounded-lg border border-line/70 bg-graphite/40">
      <div className="flex items-center justify-between border-b border-line/70 px-4 py-2.5">
        <div className="text-micro uppercase tracking-[0.2em] text-ash-gray">
          Negotiation timeline
        </div>
        <div className="flex items-center gap-2 text-micro text-dim">
          <span>{items.length} moves</span>
          {dispute.pending_feedback.length > 0 && !dispute.finalized && (
            <span className="text-warn-red">
              · {dispute.pending_feedback.length} feedback waiting
            </span>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <Empty />
      ) : (
        <ol className="divide-y divide-line/50">
          {items.map((m) => {
            const role: AgentRole = m.from_agent === ariaDid ? "aria" : "atlas";
            return <TimelineRow key={m.hash} m={m} role={role} />;
          })}
        </ol>
      )}
    </section>
  );
}

function Empty() {
  return (
    <div className="px-4 py-8 text-center text-caption text-dim">
      No moves yet — the first Propose will appear here as soon as Aria opens.
    </div>
  );
}

function TimelineRow({ m, role }: { m: DumpMessage; role: AgentRole }) {
  const tone = TYPE_TONE[m.type];
  return (
    <li
      className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 px-4 py-3 pacta-row-in"
      style={{ animationDelay: "0ms" }}
    >
      <div className="flex flex-col gap-0.5 pt-0.5">
        <span className="font-mono text-caption tabular text-bone">
          {m.ref}
        </span>
        <span className="font-mono text-micro text-dim tabular">
          r{m.round}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-micro tracking-[0.05em] ${tone.cls}`}
          >
            <span
              className={`h-1 w-1 rounded-full ${
                role === "aria" ? "bg-aria" : "bg-atlas"
              }`}
            />
            {role}
          </span>
          <span className="font-mono text-micro tracking-[0.04em] text-bone">
            {tone.label}
          </span>
          <RowHeadline m={m} />
          <span className="ml-auto font-mono text-micro text-dim tabular">
            {timeOfDay(m.timestamp)}
          </span>
        </div>
        <RowBody m={m} />
        <RowFootRefs m={m} />
      </div>
    </li>
  );
}

function RowHeadline({ m }: { m: DumpMessage }) {
  if (m.type === "Propose" || m.type === "CounterPropose") {
    const headline = formatHeadline((m as DumpProposeMsg).payload.state);
    if (headline) {
      return (
        <span className="font-mono text-caption tabular text-polar-white">
          {headline}
          <span className="ml-2 text-micro text-dim">
            u={((m as DumpProposeMsg).payload.utility_for_self).toFixed(2)}
          </span>
        </span>
      );
    }
    return (
      <span className="font-mono text-micro text-dim">
        u={((m as DumpProposeMsg).payload.utility_for_self).toFixed(2)}
      </span>
    );
  }
  if (m.type === "Reveal") {
    return (
      <span className="font-mono text-caption text-polar-white">
        domain · {(m as DumpRevealMsg).payload.domain}
      </span>
    );
  }
  if (m.type === "Accept") {
    return (
      <span className="font-mono text-caption text-amber-glow">
        target · #{shortHash((m as DumpAcceptMsg).payload.target_msg_hash, 8)}
      </span>
    );
  }
  if (m.type === "Critique") {
    return (
      <span className="font-mono text-caption text-ash-gray">
        target · #{shortHash((m as DumpCritiqueMsg).payload.target_msg_hash, 8)}
      </span>
    );
  }
  return null;
}

function RowBody({ m }: { m: DumpMessage }) {
  let text: string | null = null;
  if (m.type === "Propose" || m.type === "CounterPropose") {
    text = (m as DumpProposeMsg).payload.rationale;
  } else if (m.type === "Critique") {
    text = (m as DumpCritiqueMsg).payload.rationale;
  } else if (m.type === "Reveal") {
    text = (m as DumpRevealMsg).payload.rationale;
  } else if (m.type === "Accept") {
    text = (m as DumpAcceptMsg).payload.rationale ?? null;
  } else if (m.type === "Escalate") {
    text = (m as DumpEscalateMsg).payload.rationale;
  }
  if (!text) return null;
  return <p className="text-caption text-ash-gray">{text}</p>;
}

function RowFootRefs({ m }: { m: DumpMessage }) {
  const refs: Array<{ k: string; v: string }> = [];
  refs.push({ k: "hash", v: `#${shortHash(m.hash, 10)}` });
  if (m.parent_refs.length) {
    const parents = m.parent_refs
      .map((p) => `#${shortHash(p, 6)}`)
      .join(" ");
    refs.push({ k: "parent", v: parents });
  }
  if (m.evidence_refs.length) {
    const evs = m.evidence_refs.map((e) => `#${shortHash(e, 6)}`).join(" ");
    refs.push({ k: "evidence", v: evs });
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-micro text-dim">
      {refs.map((r) => (
        <span key={r.k}>
          <span className="text-ash-gray/60">{r.k}</span>{" "}
          <span className="text-bone">{r.v}</span>
        </span>
      ))}
    </div>
  );
}

function formatHeadline(state: { domain: string; tiers: Record<string, unknown> }): string {
  const tiers = state.tiers ?? {};
  for (const [k, v] of Object.entries(tiers)) {
    if (typeof v === "number") {
      const formatted =
        Math.abs(v) >= 1000
          ? Math.abs(v) >= 1_000_000
            ? `${(v / 1_000_000).toFixed(2)}M`
            : `${(v / 1000).toFixed(v >= 100_000 ? 0 : 1)}k`
          : v.toLocaleString();
      return `${k}=${formatted}`;
    }
    if (typeof v === "string") {
      return `${k}=${v}`;
    }
  }
  return state.domain;
}
