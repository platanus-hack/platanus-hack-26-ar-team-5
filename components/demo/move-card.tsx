"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Narration } from "./narrate";

const EASE = [0.32, 0.72, 0, 1] as const;

const ACTOR_COLOR: Record<string, string> = {
  aria: "text-amber-glow",
  atlas: "text-polar-white",
  tribunal: "text-neon-green",
};

export function MoveCard({
  narration,
  round,
  totalRounds,
}: {
  narration: Narration | null;
  round: number;
  totalRounds: number;
}) {
  return (
    <div className="rounded-[28px] bg-polar-white/[0.02] p-1.5 ring-1 ring-polar-white/[0.06]">
      <div className="relative min-h-[200px] overflow-hidden rounded-[22px] bg-deep-space px-7 py-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:px-10 md:py-9">
        <div className="flex items-center justify-between">
          <p className="text-[13px] italic text-ash-gray/65">
            What just happened
          </p>
          {round > 0 ? (
            <p className="text-[13px] text-ash-gray/70">
              <span className="text-polar-white">Round {round}</span>
              <span className="mx-1.5 text-ash-gray/40">/</span>
              <span>{totalRounds}</span>
            </p>
          ) : null}
        </div>

        <AnimatePresence mode="wait">
          {narration ? (
            <motion.div
              key={narration.headline + (narration.detail ?? "")}
              initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.55, ease: EASE }}
              className="mt-5"
            >
              {narration.move ? (
                <p
                  className={[
                    "text-[12.5px] italic",
                    narration.actor
                      ? ACTOR_COLOR[narration.actor] ?? "text-ash-gray"
                      : "text-ash-gray",
                  ].join(" ")}
                >
                  {narration.move}
                </p>
              ) : null}
              <p className="mt-1 font-aeonik text-[26px] font-medium leading-[1.2] tracking-tight text-polar-white md:text-[32px]">
                {narration.headline}
              </p>
              {narration.detail ? (
                <p className="mt-3 max-w-[60ch] text-[15px] leading-[1.6] text-ash-gray italic">
                  &ldquo;{narration.detail}&rdquo;
                </p>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-6 flex items-center gap-3 text-[14px] italic text-ash-gray"
            >
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-glow opacity-60 pacta-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-glow" />
              </span>
              Press Run to start the case.
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
