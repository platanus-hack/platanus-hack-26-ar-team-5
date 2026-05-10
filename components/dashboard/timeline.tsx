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
  DumpWithdrawMsg,
} from "./types";
import { readStateTiers, shortHash, timeOfDay } from "./format";

type Props = {
  dispute: DisputeDump;
};

/** Minimal tone per primitive. Same family, just swapped accent dot. */
const TYPE_LABEL: Record<DumpMessage["type"], string> = {
  Propose: "Propose",
  CounterPropose: "Counter",
  Critique: "Critique",
  Reveal: "Reveal",
  Accept: "Accept",
  Escalate: "Escalate",
  Withdraw: "Withdraw",
  Amend: "Amend",
};

export function Timeline({ dispute }: Props) {
  const items = dispute.history;
  const ariaDid = dispute.agents.aria;
  return (
    <section className="rounded-lg border border-line/70 bg-graphite/30">
      <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
        <div className="t-body uppercase tracking-[0.2em] text-ash-gray">
          Negotiation timeline
        </div>
        <div className="t-body text-dim">
          {items.length} {items.length === 1 ? "move" : "moves"}
          {dispute.pending_feedback.length > 0 && !dispute.finalized && (
            <span className="ml-2 text-warn-red">
              · {dispute.pending_feedback.length} feedback
            </span>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-8 text-center t-body text-dim">
          No moves yet. The first Propose appears here as soon as Aria opens.
        </div>
      ) : (
        <ol className="divide-y divide-line/50">
          {items.map((m, i) => {
            const role: AgentRole = m.from_agent === ariaDid ? "aria" : "atlas";
            const defaultOpen = i === items.length - 1;
            return (
              <TimelineRow
                key={m.hash}
                m={m}
                role={role}
                defaultOpen={defaultOpen}
              />
            );
          })}
        </ol>
      )}
    </section>
  );
}

function TimelineRow({
  m,
  role,
  defaultOpen,
}: {
  m: DumpMessage;
  role: AgentRole;
  defaultOpen: boolean;
}) {
  return (
    <li>
      <details className="group" open={defaultOpen}>
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 transition-colors hover:bg-graphite/40">
          {/* Caret */}
          <span className="t-body text-dim transition-transform group-open:rotate-90">
            ›
          </span>

          {/* Agent dot */}
          <span
            className={`h-2 w-2 flex-none rounded-full ${
              role === "aria" ? "bg-aria" : "bg-atlas"
            }`}
            aria-label={role}
          />

          {/* Type */}
          <span className="t-label w-[78px] flex-none text-polar-white">
            {TYPE_LABEL[m.type]}
          </span>

          {/* Headline (one short signal per primitive) */}
          <span className="t-label flex-1 truncate text-bone">
            <Headline m={m} />
          </span>

          {/* Refs (right side) */}
          <span className="hidden font-mono t-body text-dim sm:flex sm:items-center sm:gap-3">
            <span>{m.ref}</span>
            <span className="text-ash-gray/60">r{m.round}</span>
            <span>{timeOfDay(m.timestamp)}</span>
          </span>
        </summary>

        <div className="grid grid-cols-1 gap-4 border-t border-line/40 bg-graphite/20 px-4 py-4 sm:grid-cols-[1fr_220px]">
          <Body m={m} />
          <RefMatrix m={m} />
        </div>
      </details>
    </li>
  );
}

function Headline({ m }: { m: DumpMessage }) {
  if (m.type === "Propose" || m.type === "CounterPropose") {
    const head = formatHeadline((m as DumpProposeMsg).payload.state);
    const u = (m as DumpProposeMsg).payload.utility_for_self.toFixed(2);
    return (
      <>
        <span className="font-mono">{head}</span>
        <span className="ml-2 text-dim">u={u}</span>
      </>
    );
  }
  if (m.type === "Reveal") {
    const d = (m as DumpRevealMsg).payload.domain;
    return <span className="font-mono">domain · {d}</span>;
  }
  if (m.type === "Accept") {
    const t = (m as DumpAcceptMsg).payload.target_msg_hash;
    return (
      <span className="font-mono text-amber-glow">
        accepts #{shortHash(t, 8)}
      </span>
    );
  }
  if (m.type === "Critique") {
    const t = (m as DumpCritiqueMsg).payload.target_msg_hash;
    return (
      <span className="font-mono text-ash-gray">
        targets #{shortHash(t, 8)}
      </span>
    );
  }
  return <span className="text-dim">·</span>;
}

function Body({ m }: { m: DumpMessage }) {
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
  } else if (m.type === "Withdraw") {
    text = (m as DumpWithdrawMsg).payload.reason;
  }
  if (!text) {
    return <p className="t-body text-dim">No rationale recorded for this move.</p>;
  }
  return <p className="t-label leading-[22px] text-bone">{text}</p>;
}

function RefMatrix({ m }: { m: DumpMessage }) {
  const rows: Array<{ k: string; v: string }> = [];
  rows.push({ k: "hash", v: `#${shortHash(m.hash, 14)}` });
  if (m.parent_refs.length) {
    rows.push({
      k: m.parent_refs.length === 1 ? "parent" : "parents",
      v: m.parent_refs.map((p) => `#${shortHash(p, 8)}`).join("  "),
    });
  }
  if (m.evidence_refs.length) {
    rows.push({
      k: "evidence",
      v: m.evidence_refs.map((e) => `#${shortHash(e, 8)}`).join("  "),
    });
  }
  rows.push({ k: "round", v: `r${m.round}` });
  return (
    <dl className="space-y-1.5 self-start">
      {rows.map((r) => (
        <div key={r.k} className="grid grid-cols-[64px_1fr] gap-2 t-body">
          <dt className="text-ash-gray/70">{r.k}</dt>
          <dd className="font-mono text-bone">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatHeadline(state: unknown): string {
  const entries = readStateTiers(state);
  for (const [k, v] of entries) {
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
      const trimmed = v.length > 32 ? `${v.slice(0, 32)}…` : v;
      return `${k}=${trimmed}`;
    }
  }
  if (state && typeof state === "object" && "domain" in state) {
    const d = (state as { domain?: unknown }).domain;
    if (typeof d === "string") return d;
  }
  return "·";
}
