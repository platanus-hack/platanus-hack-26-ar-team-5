"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { ScenarioMeta } from "./scenario-meta";
import { formatStateValue } from "./scenario-meta";

const EASE = [0.32, 0.72, 0, 1] as const;

type Side = "aria" | "atlas";

type Snapshot = {
  value?: number;
  terms?: string;
  active: boolean;
  accepted: boolean;
};

export function PartyStage({
  meta,
  aria,
  atlas,
}: {
  meta: ScenarioMeta;
  aria: Snapshot;
  atlas: Snapshot;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch md:gap-6">
      <Party meta={meta} side="aria" snapshot={aria} align="left" />
      <div className="hidden md:flex md:flex-col md:items-center md:justify-center md:gap-3">
        <span className="text-[12px] italic text-ash-gray/55">vs</span>
        <span className="h-12 w-px bg-polar-white/[0.08]" />
      </div>
      <Party meta={meta} side="atlas" snapshot={atlas} align="right" />
    </div>
  );
}

const ACCENT: Record<Side, string> = {
  aria: "amber-glow",
  atlas: "polar-white",
};

function Party({
  meta,
  side,
  snapshot,
  align,
}: {
  meta: ScenarioMeta;
  side: Side;
  snapshot: Snapshot;
  align: "left" | "right";
}) {
  const party = side === "aria" ? meta.aria : meta.atlas;
  const accent = ACCENT[side];
  const formatted =
    snapshot.value !== undefined
      ? formatStateValue(meta.unit, snapshot.value)
      : null;

  // Sizing tuned per content length so non-money tiers don't overflow.
  const isLong = formatted?.primary && formatted.primary.length > 10;
  const headlineSize = isLong
    ? "text-[24px] md:text-[28px]"
    : "text-[40px] md:text-[44px]";

  const formattedKey = `${side}-${snapshot.value ?? "none"}-${snapshot.accepted ? "a" : "p"}`;

  return (
    <motion.article
      animate={{ y: snapshot.active ? -2 : 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className={[
        "relative overflow-hidden rounded-[28px] bg-polar-white/[0.02] p-1.5 ring-1 ring-polar-white/[0.06] transition-shadow duration-500",
        snapshot.active
          ? side === "aria"
            ? "shadow-[0_0_60px_-15px_rgba(231,197,154,0.35)]"
            : "shadow-[0_0_60px_-15px_rgba(243,243,243,0.18)]"
          : "",
      ].join(" ")}
    >
      <div
        className={[
          "rounded-[22px] bg-deep-space p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-9",
          align === "right" ? "md:text-right" : "",
        ].join(" ")}
      >
        <div
          className={[
            "flex items-center gap-3",
            align === "right" ? "md:flex-row-reverse" : "",
          ].join(" ")}
        >
          <span
            className={[
              "flex h-10 w-10 items-center justify-center rounded-full bg-midnight-void font-aeonik text-[14px] font-medium ring-1",
              accent === "amber-glow"
                ? "ring-amber-glow/40 text-amber-glow"
                : "ring-polar-white/30 text-polar-white",
            ].join(" ")}
          >
            {party.name.slice(0, 2).toUpperCase()}
          </span>
          <div className={align === "right" ? "md:text-right" : ""}>
            <p className="font-aeonik text-[18px] font-medium text-polar-white">
              {party.name}
            </p>
            <p className="text-[13px] text-ash-gray/75">{party.role}</p>
          </div>
        </div>

        <div
          className={[
            "mt-7 border-t border-polar-white/[0.06] pt-5",
            align === "right" ? "md:text-right" : "",
          ].join(" ")}
        >
          <p className="text-[12.5px] italic text-ash-gray/65">
            {snapshot.accepted
              ? "Accepted the standing offer"
              : snapshot.value !== undefined
                ? `Latest ${meta.movement}`
                : "Hasn't moved yet"}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={formattedKey}
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
              transition={{ duration: 0.55, ease: EASE }}
              className="mt-2"
            >
              <p
                className={[
                  "font-aeonik font-bold leading-[1.05] tracking-tight",
                  headlineSize,
                  snapshot.accepted
                    ? "text-neon-green"
                    : accent === "amber-glow"
                      ? "text-amber-glow"
                      : "text-polar-white",
                ].join(" ")}
              >
                {formatted ? formatted.primary : "—"}
              </p>
              {formatted?.secondary ? (
                <p className="mt-1.5 text-[12px] italic text-ash-gray/60">
                  {formatted.secondary}
                </p>
              ) : null}
            </motion.div>
          </AnimatePresence>
          {snapshot.terms ? (
            <p
              className={[
                "mt-4 text-[14px] leading-[1.55] text-ash-gray",
                align === "right" ? "md:max-w-[36ch] md:ml-auto" : "max-w-[40ch]",
              ].join(" ")}
            >
              {snapshot.terms}
            </p>
          ) : null}
        </div>
      </div>
    </motion.article>
  );
}
