"use client";

import { memo } from "react";
import { SCENARIO_META } from "./scenario-meta";

export type ScenarioMeta = { id: string; name: string; description: string };

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export const ScenarioPicker = memo(function ScenarioPicker({
  scenarios,
  selected,
  mock,
  running,
  onSelect,
  onMockChange,
  onRun,
  onReset,
}: {
  scenarios: ScenarioMeta[];
  selected: string;
  mock: boolean;
  running: boolean;
  onSelect: (id: string) => void;
  onMockChange: (mock: boolean) => void;
  onRun: () => void;
  onReset: () => void;
}) {
  return (
    <section
      aria-labelledby="picker-heading"
      className="rounded-[28px] bg-polar-white/[0.02] p-1.5 ring-1 ring-polar-white/[0.06]"
    >
      <div className="rounded-[22px] bg-deep-space p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-8">
        <div className="flex items-center justify-between">
          <h2
            id="picker-heading"
            className="text-[13px] italic text-ash-gray/70"
          >
            Pick a case
          </h2>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2">
          {scenarios.map((s) => {
            const active = s.id === selected;
            const detail = SCENARIO_META[s.id];
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => onSelect(s.id)}
                aria-pressed={active}
                className={[
                  "group flex flex-col items-start gap-1.5 rounded-[14px] border px-4 py-3.5 text-left transition-all",
                  active
                    ? "border-amber-glow/40 bg-amber-glow/[0.05]"
                    : "border-polar-white/[0.06] bg-polar-white/[0.01] hover:border-polar-white/15 hover:bg-polar-white/[0.04]",
                ].join(" ")}
                style={{ transition: `all 350ms ${EASE}` }}
              >
                <span
                  className={[
                    "text-[12.5px]",
                    active ? "text-amber-glow" : "text-ash-gray/65",
                  ].join(" ")}
                >
                  Case {String(scenarios.indexOf(s) + 1).padStart(2, "0")}
                  <span className="mx-1.5 text-ash-gray/35">/</span>
                  <span className="italic">{detail?.title ?? s.name}</span>
                </span>
                <span className="font-aeonik text-[14.5px] leading-snug text-polar-white">
                  {detail?.shortPitch ?? s.name}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-polar-white/[0.06] pt-5">
          <fieldset className="flex items-center gap-1 rounded-full border border-polar-white/10 bg-midnight-void/60 p-1">
            <legend className="sr-only">driver mode</legend>
            {(
              [
                { v: true, label: "Mock", hint: "deterministic, offline" },
                { v: false, label: "Live", hint: "Claude API key required" },
              ] as const
            ).map((opt) => {
              const active = mock === opt.v;
              return (
                <button
                  type="button"
                  key={String(opt.v)}
                  onClick={() => onMockChange(opt.v)}
                  aria-pressed={active}
                  title={opt.hint}
                  className={[
                    "rounded-full px-3 py-1 text-[12.5px] transition-colors",
                    active
                      ? "bg-polar-white text-midnight-void"
                      : "text-ash-gray hover:text-polar-white",
                  ].join(" ")}
                >
                  {opt.label}
                </button>
              );
            })}
          </fieldset>

          <div className="flex items-center gap-2">
            {running ? null : (
              <button
                type="button"
                onClick={onReset}
                className="rounded-full px-3 py-1.5 text-[12.5px] text-ash-gray transition-colors hover:text-polar-white"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={onRun}
              disabled={running}
              className={[
                "group inline-flex items-center gap-1.5 rounded-full py-2 pl-5 pr-1.5 text-[14px] font-medium active:scale-[0.98]",
                running
                  ? "cursor-not-allowed bg-polar-white/[0.06] text-ash-gray"
                  : "bg-polar-white text-midnight-void shadow-[0_8px_30px_-12px_rgba(231,197,154,0.55)]",
              ].join(" ")}
              style={{ transition: `transform 400ms ${EASE}` }}
            >
              {running ? (
                <>
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full bg-amber-glow pacta-breathe"
                  />
                  Running…
                </>
              ) : (
                <>
                  Run
                  <span
                    aria-hidden
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-midnight-void text-polar-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    style={{ transition: `transform 400ms ${EASE}` }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M7 17 17 7" />
                      <path d="M9 7h8v8" />
                    </svg>
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});
