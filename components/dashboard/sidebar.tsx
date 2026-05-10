"use client";

import { useEffect, useState } from "react";
import type {
  DisputeListResponse,
  DisputeSummary,
  ScenarioMeta,
  TribunalMode,
} from "./types";
import { relativeTime } from "./format";

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeed: (scenario_id: string, tribunal_mode: TribunalMode) => Promise<void>;
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
  const [tribunalMode, setTribunalMode] = useState<TribunalMode>("binding");

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
    <aside className="flex w-full flex-col border-r border-line/70 bg-midnight-void/60 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:w-[320px]">
      <SeedRow
        scenarios={scenarios}
        scenarioId={scenarioId}
        onScenarioChange={setScenarioId}
        tribunalMode={tribunalMode}
        onTribunalModeChange={setTribunalMode}
        onSeed={() => onSeed(scenarioId, tribunalMode)}
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

function SeedRow({
  scenarios,
  scenarioId,
  onScenarioChange,
  tribunalMode,
  onTribunalModeChange,
  onSeed,
  seeding,
}: {
  scenarios: ScenarioMeta[];
  scenarioId: string;
  onScenarioChange: (id: string) => void;
  tribunalMode: TribunalMode;
  onTribunalModeChange: (mode: TribunalMode) => void;
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
      <div className="mt-3 grid grid-cols-2 gap-2">
        <ModeChip
          mode="binding"
          active={tribunalMode === "binding"}
          disabled={seeding}
          onPick={() => onTribunalModeChange("binding")}
        />
        <ModeChip
          mode="none"
          active={tribunalMode === "none"}
          disabled={seeding}
          onPick={() => onTribunalModeChange("none")}
        />
      </div>
      <div className="mt-2 text-micro text-dim">
        {tribunalMode === "binding"
          ? "If they don't converge, the 3-LLM Tribunal arbitrates. Default."
          : "No tribunal. If they don't converge, bundle ends as deadline."}
      </div>
    </div>
  );
}

function ModeChip({
  mode,
  active,
  disabled,
  onPick,
}: {
  mode: TribunalMode;
  active: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const label = mode === "binding" ? "Binding tribunal" : "No tribunal";
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={[
        "rounded-md border px-2 py-1.5 text-caption transition-colors",
        active
          ? mode === "binding"
            ? "border-amber-glow/50 bg-amber-glow/10 text-amber-glow"
            : "border-warn-red/45 bg-warn-red/10 text-warn-red"
          : "border-line bg-graphite/40 text-ash-gray hover:border-steel hover:text-polar-white",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      <span className="block text-micro uppercase tracking-[0.14em]">{label}</span>
    </button>
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
  const title =
    (d.context_summary && d.context_summary.trim()) ||
    (d.claim && d.claim.trim()) ||
    d.scenario_id ||
    "Schema-less dispute";
  const dotCfg = STATUS[status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group flex flex-col gap-1 rounded-md border px-3 py-2.5 text-left transition-[border-color,background-color,transform] duration-150 will-change-transform",
        selected
          ? "border-amber-glow/40 bg-graphite/80 shadow-[inset_2px_0_0_0_var(--color-amber-glow)]"
          : "border-line/70 bg-graphite/30 hover:-translate-y-px hover:border-line hover:bg-graphite/60 active:translate-y-0",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotCfg.dot} ${status === "live" ? "pacta-pulse" : ""}`}
        />
        <span className="line-clamp-1 flex-1 text-caption text-polar-white">
          {title}
        </span>
        <span className="shrink-0 text-caption tabular text-dim">
          {relativeTime(d.created_at, now)}
        </span>
      </div>
      <span className={`text-caption ${dotCfg.label}`}>{dotCfg.text}</span>
    </button>
  );
}

type Status =
  | "live"
  | "converged"
  | "ruled"
  | "deadline"
  | "withdrawn"
  | "idle";

function statusOf(d: DisputeSummary): Status {
  if (!d.finalized) return d.history_count > 0 ? "live" : "idle";
  if (d.outcome_kind === "converged") return "converged";
  if (d.outcome_kind === "ruling") return "ruled";
  if (d.outcome_kind === "withdrawn") return "withdrawn";
  return "deadline";
}

const STATUS: Record<
  Status,
  { dot: string; label: string; text: string }
> = {
  live: { dot: "bg-pulse-green", label: "text-pulse-green", text: "Live" },
  idle: { dot: "bg-ash-gray", label: "text-ash-gray", text: "Idle" },
  converged: {
    dot: "bg-pulse-green",
    label: "text-pulse-green",
    text: "Converged",
  },
  ruled: { dot: "bg-atlas", label: "text-atlas", text: "Tribunal ruling" },
  deadline: { dot: "bg-warn-red", label: "text-warn-red", text: "Deadline" },
  withdrawn: { dot: "bg-warn-red", label: "text-warn-red", text: "Withdrawn" },
};

function SidebarFooter() {
  return (
    <div className="border-t border-line/70 px-5 py-3 t-body text-dim">
      <div className="flex items-center justify-between font-mono">
        <span>ed25519 · jcs · sha-256</span>
        <a
          href="/"
          className="text-ash-gray transition-colors hover:text-polar-white"
        >
          ↑ landing
        </a>
      </div>
    </div>
  );
}
