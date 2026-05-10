"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { DisputeDump } from "./types";
import { SimpleTimeline } from "./simple-timeline";
import { DagGraph } from "./dag-graph";

type Mode = "simple" | "deep";

type Props = { dispute: DisputeDump };

const ease = [0.16, 1, 0.3, 1] as const;

export function DisputeFlow({ dispute }: Props) {
  const [mode, setMode] = useState<Mode>("simple");

  return (
    <section className="rounded-lg border border-line/70 bg-graphite/30">
      <header className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
        <div className="text-body font-medium text-polar-white">Flow</div>
        <ModeToggle mode={mode} onChange={setMode} />
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {mode === "simple" ? (
          <motion.div
            key="simple"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease }}
            className="px-4 py-4"
          >
            {dispute.history.length === 0 && !dispute.finalized ? (
              <p className="text-caption text-dim">
                Waiting for the first move…
              </p>
            ) : (
              <SimpleTimeline dispute={dispute} />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="deep"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease }}
          >
            <DagGraph dispute={dispute} bare />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  const options: Array<{ value: Mode; label: string }> = [
    { value: "simple", label: "Simple" },
    { value: "deep", label: "Deep" },
  ];
  return (
    <div className="relative inline-flex rounded-md border border-line/70 bg-graphite/60 p-0.5 text-caption">
      {options.map((o) => {
        const active = o.value === mode;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`relative z-10 px-3 py-1 transition-colors ${
              active
                ? "text-polar-white"
                : "text-ash-gray hover:text-bone"
            }`}
          >
            {active && (
              <motion.span
                layoutId="flow-toggle"
                aria-hidden="true"
                transition={{ duration: 0.22, ease }}
                className="absolute inset-0 -z-10 rounded-[5px] bg-iron"
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
