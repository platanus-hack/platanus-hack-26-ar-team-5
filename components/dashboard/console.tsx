"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DisputeDump, TribunalMode } from "./types";
import { Sidebar } from "./sidebar";
import { DisputeView } from "./dispute-view";
import { DagGraph } from "./dag-graph";

const POLL_INTERVAL_MS = 1500;

export function Console() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dispute, setDispute] = useState<DisputeDump | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const seedDrainRef = useRef<AbortController | null>(null);

  // Poll the selected dispute.
  useEffect(() => {
    if (!selectedId) {
      setDispute(null);
      return;
    }
    let cancelled = false;
    let stopped = false;

    async function tick() {
      try {
        const r = await fetch(`/api/disputes/${selectedId}`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const j = (await r.json()) as DisputeDump;
        if (cancelled) return;
        setDispute(j);
        if (j.finalized) stopped = true;
      } catch {
        /* swallow — next tick will retry */
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
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
          {error && (
            <div className="mb-4 rounded-md border border-warn-red/40 bg-warn-red/10 px-4 py-2.5 text-caption text-warn-red">
              {error}
            </div>
          )}
          {!selectedId && <EmptyState seeding={seeding} />}
          {selectedId && !dispute && <LoadingDispute />}
          {dispute && (
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
              <DisputeView dispute={dispute} />
              <DagGraph dispute={dispute} />
            </div>
          )}
        </div>
      </main>
    </div>
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 py-16">
      <header className="flex flex-col gap-2">
        <span className="text-caption text-ash-gray">Workbench</span>
        <h2 className="text-[22px] font-medium leading-tight text-polar-white">
          {seeding
            ? "Seeding a dispute…"
            : "Pick a dispute from the sidebar, or seed one."}
        </h2>
        <p className="text-body text-ash-gray">
          {seeding
            ? "Claude is booting both sides. The first move lands here in a few seconds."
            : "Pacta is the protocol two AI agents use when they disagree. Each move is signed, every offer cites evidence, and the outcome is a bundle a third party can verify offline."}
        </p>
      </header>

      {!seeding && <ExplainerSteps />}
    </div>
  );
}

function ExplainerSteps() {
  const steps: Array<{ title: string; body: string }> = [
    {
      title: "Two agents open a dispute",
      body: "The opener brings a free-form claim (or picks a bundled scenario). Each side gets a DID and a token to act on its turn.",
    },
    {
      title: "They exchange signed moves",
      body: "Propose, CounterPropose, Critique, Reveal — every move is Ed25519-signed and content-addressed. Utility for self must be monotonically non-increasing (the compromise bound).",
    },
    {
      title: "They converge — or escalate",
      body: "A bilateral Accept ends the dispute. If they deadlock, a 3-LLM Tribunal rules. Either way you walk away with a signed bundle (root_hash + every message + every evidence) verifiable offline.",
    },
  ];
  return (
    <ol className="flex flex-col gap-5 border-l border-line/60 pl-6">
      {steps.map((s, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[35px] top-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-line/70 bg-iron text-micro tabular text-bone">
            {i + 1}
          </span>
          <p className="text-caption font-medium text-polar-white">
            {s.title}
          </p>
          <p className="mt-0.5 text-caption text-ash-gray">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
