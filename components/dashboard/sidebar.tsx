"use client";

import { useEffect, useState } from "react";
import type { DisputeListResponse, DisputeSummary, ScenarioMeta } from "./types";
import { relativeTime } from "./format";

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeed: (scenario_id: string) => Promise<void>;
  seeding: boolean;
  refreshSignal: number;
};

export function Sidebar({
  selectedId,
  onSelect,
  onSeed,
  seeding,
  refreshSignal,
}: Props) {
  const [data, setData] = useState<DisputeListResponse | null>(null);
  const [now, setNow] = useState(Date.now());
  const [scenarioId, setScenarioId] = useState<string>("ai-overrun");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/disputes", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as DisputeListResponse;
        if (!cancelled) setData(j);
      } catch {
        /* swallow */
      }
    }
    load();
    const id = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshSignal]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const scenarios = data?.scenarios ?? [];
  const disputes = data?.disputes ?? [];

  return (
    <aside className="flex h-full w-full flex-col border-r border-line/70 bg-midnight-void/60 lg:w-[320px]">
      <SidebarHeader />
      <SeedRow
        scenarios={scenarios}
        scenarioId={scenarioId}
        onScenarioChange={setScenarioId}
        onSeed={() => onSeed(scenarioId)}
        seeding={seeding}
      />
      <DisputeList
        disputes={disputes}
        selectedId={selectedId}
        onSelect={onSelect}
        now={now}
      />
      <SidebarFooter />
    </aside>
  );
}

function SidebarHeader() {
  return (
    <div className="border-b border-line/70 px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2 w-2 items-center justify-center">
          <span className="absolute inline-flex h-full w-full rounded-full bg-pulse-green/60 pacta-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-pulse-green" />
        </span>
        <div className="text-[15px] font-semibold tracking-tight text-polar-white">
          Pacta
        </div>
        <span className="ml-auto text-micro uppercase tracking-[0.18em] text-ash-gray">
          Console
        </span>
      </div>
      <div className="mt-1 text-micro text-dim">
        Dispute observability — live feed
      </div>
    </div>
  );
}

function SeedRow({
  scenarios,
  scenarioId,
  onScenarioChange,
  onSeed,
  seeding,
}: {
  scenarios: ScenarioMeta[];
  scenarioId: string;
  onScenarioChange: (id: string) => void;
  onSeed: () => void;
  seeding: boolean;
}) {
  return (
    <div className="border-b border-line/70 px-5 py-4">
      <div className="text-micro uppercase tracking-[0.18em] text-ash-gray">
        Seed demo dispute
      </div>
      <div className="mt-2.5 flex w-full items-stretch gap-2">
        <select
          value={scenarioId}
          onChange={(e) => onScenarioChange(e.target.value)}
          disabled={seeding || scenarios.length === 0}
          className="min-w-0 flex-1 truncate rounded-md border border-line bg-graphite px-2.5 py-1.5 text-caption text-polar-white outline-none transition-colors hover:border-steel focus:border-amber-glow/60 disabled:opacity-40"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id} className="bg-graphite">
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onSeed}
          disabled={seeding}
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-polar-white px-3 py-1.5 text-caption font-medium text-deep-space transition-colors hover:bg-bone disabled:cursor-wait disabled:bg-ash-gray/40 disabled:text-deep-space/70"
        >
          {seeding ? "Seeding…" : "Run"}
        </button>
      </div>
      <div className="mt-2 text-micro text-dim">
        Both sides driven by Claude. Watch the negotiation build live.
      </div>
    </div>
  );
}

function DisputeList({
  disputes,
  selectedId,
  onSelect,
  now,
}: {
  disputes: DisputeSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: number;
}) {
  if (disputes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-start gap-2 p-5">
        <div className="text-micro uppercase tracking-[0.18em] text-ash-gray">
          Active disputes
        </div>
        <div className="rounded-md border border-dashed border-line/80 bg-graphite/40 px-3 py-4 text-caption text-dim">
          No disputes yet. Seed one to watch a live negotiation unfold.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3">
      <div className="px-2 pt-1 pb-1 text-micro uppercase tracking-[0.18em] text-ash-gray">
        Active disputes
      </div>
      {disputes.map((d) => (
        <DisputeRow
          key={d.dispute_id}
          d={d}
          selected={d.dispute_id === selectedId}
          onClick={() => onSelect(d.dispute_id)}
          now={now}
        />
      ))}
    </div>
  );
}

function DisputeRow({
  d,
  selected,
  onClick,
  now,
}: {
  d: DisputeSummary;
  selected: boolean;
  onClick: () => void;
  now: number;
}) {
  const status = statusOf(d);
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group flex flex-col gap-2 rounded-md border px-3 py-2.5 text-left transition-all duration-150",
        selected
          ? "border-amber-glow/40 bg-graphite/80"
          : "border-line/70 bg-graphite/30 hover:border-line hover:bg-graphite/60",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-caption text-polar-white">
          {d.dispute_id.slice(0, 14)}
        </span>
        <StatusBadge status={status} />
      </div>
      <div className="flex items-center justify-between gap-2 text-micro text-ash-gray">
        <span className="truncate">{d.scenario_id ?? "schema-less"}</span>
        <span className="font-mono text-dim tabular">{relativeTime(d.created_at, now)}</span>
      </div>
      <div className="flex items-center gap-3 text-micro text-dim">
        <span>round {d.current_round}/{d.max_rounds}</span>
        <span aria-hidden>·</span>
        <span>{d.history_count} msg</span>
        <span aria-hidden>·</span>
        <span>{d.evidence_count} evd</span>
      </div>
    </button>
  );
}

type Status = "live" | "converged" | "ruled" | "deadline" | "idle";

function statusOf(d: DisputeSummary): Status {
  if (!d.finalized) return d.history_count > 0 ? "live" : "idle";
  if (d.outcome_kind === "converged") return "converged";
  if (d.outcome_kind === "ruling") return "ruled";
  return "deadline";
}

function StatusBadge({ status }: { status: Status }) {
  const cfg: Record<Status, { label: string; cls: string; dot: string }> = {
    live: {
      label: "live",
      cls: "border-pulse-green/40 bg-pulse-green/10 text-pulse-green",
      dot: "bg-pulse-green",
    },
    idle: {
      label: "idle",
      cls: "border-ash-gray/30 bg-ash-gray/10 text-ash-gray",
      dot: "bg-ash-gray",
    },
    converged: {
      label: "converged",
      cls: "border-amber-glow/30 bg-amber-glow/10 text-amber-glow",
      dot: "bg-amber-glow",
    },
    ruled: {
      label: "ruled",
      cls: "border-atlas/40 bg-atlas/10 text-atlas",
      dot: "bg-atlas",
    },
    deadline: {
      label: "deadline",
      cls: "border-warn-red/40 bg-warn-red/10 text-warn-red",
      dot: "bg-warn-red",
    },
  };
  const c = cfg[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-micro tracking-[0.06em] ${c.cls}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${c.dot} ${status === "live" ? "pacta-pulse" : ""}`}
      />
      {c.label}
    </span>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-line/70 px-5 py-3 text-micro text-dim">
      <div className="flex items-center justify-between">
        <span>signed · ed25519</span>
        <span className="font-mono">jcs · sha-256</span>
      </div>
    </div>
  );
}
