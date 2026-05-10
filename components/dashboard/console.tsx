"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DisputeDump, TribunalMode } from "./types";
import { Sidebar } from "./sidebar";
import { HeaderBar } from "./header-bar";
import { PartiesRow } from "./parties-row";
import { UtilityChart } from "./utility-chart";
import { Timeline } from "./timeline";
import { EvidenceRail } from "./evidence-rail";
import { OutcomeBanner } from "./outcome-banner";
import { DagGraph } from "./dag-graph";

const POLL_INTERVAL_MS = 1500;

export function Console() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dispute, setDispute] = useState<DisputeDump | null>(null);
  const [online, setOnline] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const seedDrainRef = useRef<AbortController | null>(null);

  // Poll the selected dispute.
  useEffect(() => {
    if (!selectedId) {
      setDispute(null);
      setOnline(false);
      return;
    }
    let cancelled = false;
    let stopped = false;

    async function tick() {
      try {
        const r = await fetch(`/api/disputes/${selectedId}`, {
          cache: "no-store",
        });
        if (!r.ok) {
          if (!cancelled) setOnline(false);
          return;
        }
        const j = (await r.json()) as DisputeDump;
        if (cancelled) return;
        setDispute(j);
        setOnline(true);
        if (j.finalized) stopped = true;
      } catch {
        if (!cancelled) setOnline(false);
      }
    }

    tick();
    const id = setInterval(() => {
      if (!stopped) tick();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedId]);

  const seed = useCallback(
    async (scenario_id: string, tribunal_mode: TribunalMode) => {
    setSeeding(true);
    setError(null);
    try {
      // Cancel any prior seed stream we were draining.
      seedDrainRef.current?.abort();
      const ac = new AbortController();
      seedDrainRef.current = ac;

      const r = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario_id, tribunal_mode }),
        signal: ac.signal,
      });

      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }

      const headerId = r.headers.get("X-Pacta-Dispute-Id");
      if (headerId) {
        setSelectedId(headerId);
        setRefreshSignal((s) => s + 1);
      }

      // Drain the body in the background to keep the server function alive
      // (advancing Claude turns and persisting after each one). The dashboard
      // poll picks up the same state through GET /api/disputes/:id.
      const reader = r.body?.getReader();
      if (reader) {
        (async () => {
          try {
            const decoder = new TextDecoder();
            let buf = "";
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              // Try to recover dispute_id from the first event if header was
              // missing (shouldn't happen, but defend).
              const nl = buf.indexOf("\n");
              if (nl !== -1 && !headerId) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (line.length > 0) {
                  try {
                    const ev = JSON.parse(line) as {
                      kind?: string;
                      dispute_id?: string;
                    };
                    if (ev.kind === "dispute.created" && ev.dispute_id) {
                      setSelectedId(ev.dispute_id);
                      setRefreshSignal((s) => s + 1);
                    }
                  } catch {
                    /* ignore */
                  }
                }
              }
            }
          } catch {
            /* swallow */
          } finally {
            setSeeding(false);
            setRefreshSignal((s) => s + 1);
          }
        })();
      } else {
        setSeeding(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSeeding(false);
    }
  },
    [],
  );

  const withdraw = useCallback(
    async (dispute_id: string, role: "aria" | "atlas", reason: string) => {
      setError(null);
      try {
        const r = await fetch(
          `/api/disputes/${encodeURIComponent(dispute_id)}/withdraw`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, reason }),
          },
        );
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        setRefreshSignal((s) => s + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  return (
    <div className="flex min-h-screen flex-col bg-deep-space text-polar-white lg:flex-row">
      <Sidebar
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        onSeed={seed}
        seeding={seeding}
        refreshSignal={refreshSignal}
      />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <HeaderBar dispute={dispute} online={online} />
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
          {error && (
            <div className="mb-4 rounded-md border border-warn-red/40 bg-warn-red/10 px-4 py-2.5 text-caption text-warn-red">
              {error}
            </div>
          )}
          {!selectedId && <EmptyState seeding={seeding} />}
          {selectedId && !dispute && <LoadingDispute />}
          {dispute && (
            <div className="flex flex-col gap-5">
              {dispute.claim && <ClaimBanner claim={dispute.claim} />}
              <ModeBanner dispute={dispute} onWithdraw={withdraw} />
              <PartiesRow dispute={dispute} />
              <DagGraph dispute={dispute} />
              <UtilityChart dispute={dispute} />
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                <Timeline dispute={dispute} />
                <EvidenceRail dispute={dispute} />
              </div>
              {dispute.finalized && <OutcomeBanner dispute={dispute} />}
              {dispute.pending_feedback.length > 0 && !dispute.finalized && (
                <FeedbackPanel feedback={dispute.pending_feedback} />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ClaimBanner({ claim }: { claim: string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-graphite/40 px-4 py-3 text-caption text-bone">
      <span className="mr-2 text-micro uppercase tracking-[0.18em] text-ash-gray">
        Claim
      </span>
      {claim}
    </div>
  );
}

function ModeBanner({
  dispute,
  onWithdraw,
}: {
  dispute: DisputeDump;
  onWithdraw: (
    dispute_id: string,
    role: "aria" | "atlas",
    reason: string,
  ) => Promise<void>;
}) {
  const mode = dispute.tribunal_mode;
  const opener = dispute.opened_by_role;
  const finalized = !!dispute.finalized;
  const tone =
    mode === "binding"
      ? "border-amber-glow/30 bg-amber-glow/5 text-amber-glow"
      : "border-warn-red/40 bg-warn-red/5 text-warn-red";
  const summary =
    mode === "binding"
      ? "Binding tribunal — if these two don't converge, the 3-LLM Tribunal arbitrates."
      : "No tribunal — parties opted out at open. If they don't converge, bundle ends as deadline.";
  // Hold-out attribution: when the opener picked NONE, surface that
  // asymmetry explicitly so a watching party / auditor sees who chose to
  // remove the failsafe. Demo-seeded disputes have opened_by_role=null and
  // skip this attribution (no real party picked the mode).
  const attribution =
    opener && mode === "none"
      ? `${opener} opened with NONE — joiner had no failsafe.`
      : opener
        ? `${opener} opened.`
        : null;
  return (
    <section
      className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 ${tone}`}
    >
      <span className="text-micro font-mono uppercase tracking-[0.2em]">
        tribunal_mode · {mode}
      </span>
      <span className="t-body text-bone">{summary}</span>
      {attribution && (
        <span className="font-mono text-micro uppercase tracking-[0.14em] text-ash-gray">
          · {attribution}
        </span>
      )}
      {!finalized && (
        <div className="ml-auto flex items-center gap-2">
          <WithdrawButton
            label="Aria withdraws"
            onClick={() =>
              onWithdraw(
                dispute.dispute_id,
                "aria",
                "Aria walked from the dashboard.",
              )
            }
          />
          <WithdrawButton
            label="Atlas withdraws"
            onClick={() =>
              onWithdraw(
                dispute.dispute_id,
                "atlas",
                "Atlas walked from the dashboard.",
              )
            }
          />
        </div>
      )}
    </section>
  );
}

function WithdrawButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-warn-red/40 bg-warn-red/10 px-3 py-1 text-micro font-medium uppercase tracking-[0.14em] text-warn-red transition-colors hover:bg-warn-red/20"
    >
      {label}
    </button>
  );
}

function FeedbackPanel({ feedback }: { feedback: string[] }) {
  return (
    <section className="rounded-lg border border-warn-red/30 bg-graphite/50">
      <div className="border-b border-warn-red/20 bg-warn-red/5 px-4 py-2.5 text-micro uppercase tracking-[0.2em] text-warn-red">
        Pending validator feedback
      </div>
      <ul className="divide-y divide-line/50">
        {feedback.map((f, i) => (
          <li key={i} className="px-4 py-2.5 font-mono text-caption text-bone">
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LoadingDispute() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow tall />
    </div>
  );
}

function SkeletonRow({ tall }: { tall?: boolean }) {
  return (
    <div
      className={`pacta-shimmer rounded-lg border border-line/70 bg-graphite/40 ${
        tall ? "h-48" : "h-24"
      }`}
    />
  );
}

function EmptyState({ seeding }: { seeding: boolean }) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <h2 className="t-display max-w-md font-light text-white">
        {seeding ? "Seeding a dispute." : "Pick a dispute."}
      </h2>
      <p className="t-label max-w-sm text-white/55">
        {seeding
          ? "Claude is booting both sides. The first move appears here in a few seconds."
          : "Or seed a new one to watch two AI agents negotiate, cite evidence, and produce a signed bundle."}
      </p>
    </div>
  );
}
