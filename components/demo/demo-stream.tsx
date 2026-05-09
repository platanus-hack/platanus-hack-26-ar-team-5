"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { readNdjson } from "../../lib/ndjson";
import type { StreamEvent } from "../../src/pacta";
import type {
  Bundle,
  SignedMessage,
  SignedRuling,
  SignedVote,
} from "../../src/types";
import { ScenarioPicker, type ScenarioMeta as PickerMeta } from "./scenario-picker";
import { type TranscriptEntry } from "./transcript";
import { type UtilityPoint } from "./utility-curve";
import { PartyStage } from "./party-stage";
import { TensionMeter } from "./tension-meter";
import { MoveCard } from "./move-card";
import { SettledBanner } from "./settled-banner";
import { AuditTrail } from "./audit-trail";
import { getScenarioMeta } from "./scenario-meta";
import { narrate, type Narration } from "./narrate";

type AgentRole = "aria" | "atlas" | "tribunal";

type Status = "idle" | "streaming" | "converged" | "ruling" | "deadline" | "error";

type PartySnapshot = {
  value?: number;
  terms?: string;
  active: boolean;
  accepted: boolean;
};

type State = {
  status: Status;
  scenarioId: string;
  scenarioName?: string;
  agents: Partial<Record<AgentRole, { name: string; did: string }>>;
  evidence: Array<{ id: string; tier: string; hash: string }>;
  rounds: number;
  transcript: TranscriptEntry[];
  utilities: UtilityPoint[];
  rejections: Array<{ round: number; role: AgentRole; reason: string; attempt: number }>;
  juryActive: boolean;
  votes: SignedVote[];
  ruling?: SignedRuling;
  bundle?: Bundle;
  error?: string;
  mode: "mock" | "live";
  /** Latest narration (paced). */
  narration: Narration | null;
  /** Snapshots per side for the stage. */
  ariaSnap: PartySnapshot;
  atlasSnap: PartySnapshot;
};

type Action =
  | { type: "reset"; scenarioId: string }
  | { type: "start" }
  | { type: "event"; event: StreamEvent }
  | { type: "set-scenario"; id: string }
  | { type: "set-mode"; mode: "mock" | "live" }
  | { type: "stream-end" }
  | { type: "stream-error"; message: string };

const TOTAL_ROUNDS = 5;

const PACE: Partial<Record<StreamEvent["kind"], number>> = {
  "scenario.selected": 200,
  "agent.boot": 120,
  "evidence.loaded": 900,
  "round.start": 400,
  "message.rejected": 700,
  "message.accepted": 1700,
  convergence: 2400,
  deadline: 1800,
  deadlock: 1100,
  escalation: 1500,
  "jury.start": 1300,
  "jury.vote": 1200,
  "jury.ruling": 2400,
  bundle: 600,
};

function ensureUtilityRound(prev: UtilityPoint[], round: number): UtilityPoint[] {
  if (prev.some((p) => p.round === round)) return prev;
  return [...prev, { round }].sort((a, b) => a.round - b.round);
}

function setUtility(
  prev: UtilityPoint[],
  round: number,
  role: "aria" | "atlas",
  value: number,
): UtilityPoint[] {
  const arr = ensureUtilityRound(prev, round);
  return arr.map((p) => (p.round === round ? { ...p, [role]: value } : p));
}

function resetSnap(): PartySnapshot {
  return { value: undefined, terms: undefined, active: false, accepted: false };
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "set-scenario": {
      // Switching cases must not leak previous transcript / bundle / snaps.
      // Keep mode preference, drop everything else.
      return {
        ...init(action.id),
        mode: state.mode,
      };
    }
    case "set-mode":
      return { ...state, mode: action.mode };
    case "reset":
      return {
        ...state,
        status: "idle",
        scenarioId: action.scenarioId,
        scenarioName: undefined,
        agents: {},
        evidence: [],
        rounds: 0,
        transcript: [],
        utilities: [],
        rejections: [],
        juryActive: false,
        votes: [],
        ruling: undefined,
        bundle: undefined,
        error: undefined,
        narration: null,
        ariaSnap: resetSnap(),
        atlasSnap: resetSnap(),
      };
    case "start":
      return { ...state, status: "streaming" };
    case "event": {
      const ev = action.event;
      const meta = getScenarioMeta(state.scenarioId);
      const narration = narrate(ev, meta);
      const next: State = {
        ...state,
        narration: narration ?? state.narration,
      };
      switch (ev.kind) {
        case "scenario.selected":
          return {
            ...next,
            scenarioId: ev.scenario.id,
            scenarioName: ev.scenario.name,
          };
        case "agent.boot":
          return {
            ...next,
            agents: { ...state.agents, [ev.role]: { name: ev.name, did: ev.did } },
          };
        case "evidence.loaded":
          return { ...next, evidence: ev.items };
        case "round.start":
          return { ...next, rounds: Math.max(state.rounds, ev.round) };
        case "message.rejected":
          return {
            ...next,
            rejections: [
              ...state.rejections,
              {
                round: ev.round,
                role: ev.role as AgentRole,
                reason: ev.reason,
                attempt: ev.attempt,
              },
            ],
          };
        case "message.accepted": {
          const role = ev.role as AgentRole;
          const m: SignedMessage = ev.signed;
          const entry: TranscriptEntry = {
            round: ev.round,
            role: role as TranscriptEntry["role"],
            signed: m,
            hash: ev.hash,
          };
          let utilities = state.utilities;
          let ariaSnap = { ...state.ariaSnap, active: false };
          let atlasSnap = { ...state.atlasSnap, active: false };

          if (role === "aria" || role === "atlas") {
            if (m.type === "Propose" || m.type === "CounterPropose") {
              utilities = setUtility(
                utilities,
                ev.round,
                role,
                m.payload.utility_for_self,
              );
              const snap: PartySnapshot = {
                value: m.payload.state.credit_usd,
                terms: m.payload.state.terms,
                active: true,
                accepted: false,
              };
              if (role === "aria") ariaSnap = snap;
              else atlasSnap = snap;
            } else if (m.type === "Accept") {
              // Find the proposal this Accept points at — both parties
              // accepting the same hash is what makes convergence valid, so
              // their cards must show the SAME accepted offer.
              const targetHash = m.payload.target_msg_hash;
              const target = state.transcript.find((t) => t.hash === targetHash)
                ?.signed;
              const acceptedFrom =
                target && (target.type === "Propose" || target.type === "CounterPropose")
                  ? {
                      value: target.payload.state.credit_usd,
                      terms: target.payload.state.terms,
                    }
                  : null;
              if (role === "aria") {
                ariaSnap = acceptedFrom
                  ? { ...acceptedFrom, active: true, accepted: true }
                  : { ...state.ariaSnap, active: true, accepted: true };
              } else {
                atlasSnap = acceptedFrom
                  ? { ...acceptedFrom, active: true, accepted: true }
                  : { ...state.atlasSnap, active: true, accepted: true };
              }
            } else {
              if (role === "aria") ariaSnap = { ...state.ariaSnap, active: true };
              else atlasSnap = { ...state.atlasSnap, active: true };
            }
          }

          return {
            ...next,
            transcript: [...state.transcript, entry],
            utilities,
            ariaSnap,
            atlasSnap,
          };
        }
        case "convergence": {
          // Force both party cards onto the SAME final state — by protocol,
          // both must have accepted the same hash to reach this event.
          const settled: PartySnapshot = {
            value: ev.final_state.credit_usd,
            terms: ev.final_state.terms,
            active: true,
            accepted: true,
          };
          return {
            ...next,
            status: "converged",
            ariaSnap: settled,
            atlasSnap: settled,
          };
        }
        case "deadline":
          return { ...next, status: "deadline" };
        case "deadlock":
          return next;
        case "escalation":
          return next;
        case "jury.start":
          return { ...next, juryActive: true };
        case "jury.vote":
          return { ...next, votes: [...state.votes, ev.vote] };
        case "jury.ruling": {
          // Same idea for a ruling — both parties end up bound to the
          // tribunal's remedy, so reflect that on both cards.
          const settled: PartySnapshot = {
            value: ev.ruling.remedy.credit_usd,
            terms: ev.ruling.remedy.terms,
            active: true,
            accepted: true,
          };
          return {
            ...next,
            ruling: ev.ruling,
            status: "ruling",
            ariaSnap: settled,
            atlasSnap: settled,
          };
        }
        case "bundle":
          return { ...next, bundle: ev.bundle };
        default:
          return next;
      }
    }
    case "stream-end":
      return state.status === "streaming"
        ? { ...state, status: "deadline" }
        : state;
    case "stream-error":
      return { ...state, status: "error", error: action.message };
    default:
      return state;
  }
}

function init(initialScenario: string): State {
  return {
    status: "idle",
    scenarioId: initialScenario,
    agents: {},
    evidence: [],
    rounds: 0,
    transcript: [],
    utilities: [],
    rejections: [],
    juryActive: false,
    votes: [],
    mode: "mock",
    narration: null,
    ariaSnap: resetSnap(),
    atlasSnap: resetSnap(),
  };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function computeProgress(state: State): number {
  // Use latest aria + atlas utilities. When their sum approaches a "fair"
  // band (~0.6 — heuristic), call it converged. Cap at 0/1.
  const last = state.utilities[state.utilities.length - 1];
  if (!last) return 0;
  const a = last.aria ?? 0;
  const b = last.atlas ?? 0;
  const sum = a + b;
  // Both starting at 1.0 / 0.0 respectively, sum starts ~1.0, target ~1.4-1.6.
  return Math.min(1, Math.max(0, (sum - 0.7) / 0.7));
}

function statusToMeterState(s: State["status"]): "negotiating" | "converged" | "ruling" | "deadline" | "idle" {
  if (s === "idle") return "idle";
  if (s === "converged") return "converged";
  if (s === "ruling") return "ruling";
  if (s === "deadline") return "deadline";
  return "negotiating";
}

export function DemoStream({
  scenarios,
  initialScenario,
}: {
  scenarios: PickerMeta[];
  initialScenario: string;
}) {
  const [state, dispatch] = useReducer(reduce, initialScenario, init);
  const abortRef = useRef<AbortController | null>(null);
  const meta = getScenarioMeta(state.scenarioId);

  const onRun = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    dispatch({ type: "reset", scenarioId: state.scenarioId });
    dispatch({ type: "start" });

    try {
      const params = new URLSearchParams({
        scenario: state.scenarioId,
        mock: state.mode === "mock" ? "1" : "0",
      });
      const res = await fetch(`/api/negotiation?${params.toString()}`, {
        signal: ctrl.signal,
        cache: "no-store",
        headers: { Accept: "application/x-ndjson" },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        dispatch({
          type: "stream-error",
          message: `negotiation request failed (${res.status}) ${text.slice(0, 200)}`,
        });
        return;
      }

      // Buffer all events (mock arrives quickly), then drain at human-readable pace.
      const events: StreamEvent[] = [];
      for await (const ev of readNdjson<StreamEvent>(res.body)) {
        events.push(ev);
      }

      for (const ev of events) {
        if (ctrl.signal.aborted) return;
        dispatch({ type: "event", event: ev });
        const delay = PACE[ev.kind] ?? 600;
        await sleep(delay);
      }

      dispatch({ type: "stream-end" });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      dispatch({
        type: "stream-error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [state.scenarioId, state.mode]);

  const onReset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "reset", scenarioId: state.scenarioId });
  }, [state.scenarioId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="space-y-10">
      {/* Reactive case header — updates when scenario changes */}
      <header className="max-w-3xl">
        <p className="text-[13px] italic text-ash-gray/70">A live case</p>
        <h1 className="mt-4 font-aeonik text-[44px] font-bold leading-[1.02] tracking-[-0.02em] text-polar-white md:text-[64px]">
          {meta.title}.
        </h1>
        <p className="mt-5 max-w-[58ch] text-[16px] leading-[1.6] text-ash-gray">
          {meta.intro} Press Run and watch both sides give ground until they
          land a deal — or punt to the bench.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <aside className="lg:col-span-4">
          <ScenarioPicker
            scenarios={scenarios}
            selected={state.scenarioId}
            mock={state.mode === "mock"}
            running={state.status === "streaming"}
            onSelect={(id) => {
              abortRef.current?.abort();
              dispatch({ type: "set-scenario", id });
            }}
            onMockChange={(mock) =>
              dispatch({ type: "set-mode", mode: mock ? "mock" : "live" })
            }
            onRun={onRun}
            onReset={onReset}
          />
        </aside>

        <section className="space-y-6 lg:col-span-8">
          {/* Story stage */}
          <PartyStage
            meta={meta}
            aria={state.ariaSnap}
            atlas={state.atlasSnap}
          />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <div className="md:col-span-7">
              <MoveCard
                narration={state.narration}
                round={state.rounds}
                totalRounds={TOTAL_ROUNDS}
              />
            </div>
            <div className="md:col-span-5">
              <TensionMeter
                progress={computeProgress(state)}
                round={Math.max(1, state.rounds)}
                totalRounds={TOTAL_ROUNDS}
                status={statusToMeterState(state.status)}
              />
            </div>
          </div>

          {/* Settled / ruling banner */}
          {state.bundle ? (
            <SettledBanner
              meta={meta}
              bundle={state.bundle}
              ruling={state.ruling}
              rounds={state.rounds}
            />
          ) : null}

          {/* Inline error if any */}
          {state.status === "error" && state.error ? (
            <p
              role="alert"
              className="rounded-md border border-amber-glow/60 bg-amber-glow/[0.06] px-4 py-3 text-[14px] text-amber-glow"
            >
              {state.error}
            </p>
          ) : null}
        </section>
      </div>

      {/* Audit trail (hashes, signatures, raw transcript) */}
      <AuditTrail
        transcript={state.transcript}
        utilities={state.utilities}
        evidence={state.evidence}
        votes={state.votes}
        ruling={state.ruling}
        juryActive={state.juryActive}
        bundle={state.bundle}
      />
    </div>
  );
}
