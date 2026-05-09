"use client";

import { motion } from "framer-motion";

const EASE = [0.32, 0.72, 0, 1] as const;

/**
 * Visualises convergence on a 0..1 scale (0 = far apart, 1 = met).
 * `progress` is computed by the caller from utility deltas.
 */
export function TensionMeter({
  progress,
  round,
  totalRounds,
  status,
}: {
  progress: number;
  round: number;
  totalRounds: number;
  status: "negotiating" | "converged" | "ruling" | "deadline" | "idle";
}) {
  const pct = Math.max(0, Math.min(1, progress));
  const tint =
    status === "converged"
      ? "bg-neon-green"
      : status === "ruling"
        ? "bg-amber-glow"
        : status === "deadline"
          ? "bg-ash-gray"
          : "bg-polar-white/85";
  const label =
    status === "converged"
      ? "Met in the middle."
      : status === "ruling"
        ? "Heading to the bench."
        : status === "deadline"
          ? "Time ran out."
          : pct < 0.15
            ? "Still far apart."
            : pct < 0.55
              ? "Closing the gap."
              : pct < 0.95
                ? "Almost there."
                : "On the verge.";

  return (
    <div className="rounded-[22px] bg-polar-white/[0.02] p-1.5 ring-1 ring-polar-white/[0.06]">
      <div className="rounded-[16px] bg-deep-space px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center justify-between">
          <p className="text-[13.5px] italic text-polar-white">{label}</p>
          <p className="text-[13px] text-ash-gray/70">
            <span className="text-polar-white">Round {round}</span>
            <span className="mx-1.5 text-ash-gray/40">/</span>
            <span>{totalRounds}</span>
          </p>
        </div>

        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-polar-white/[0.05]">
          <motion.span
            className={`absolute inset-y-0 left-0 ${tint}`}
            animate={{ width: `${pct * 100}%` }}
            transition={{ duration: 0.85, ease: EASE }}
            style={{ borderRadius: 999 }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between text-[12px] italic text-ash-gray/55">
          <span>Far apart</span>
          <span>Met</span>
        </div>
      </div>
    </div>
  );
}
