"use client";

import { motion } from "framer-motion";
import type { Bundle, SignedRuling } from "../../src/types";
import { formatStateValue, type ScenarioMeta } from "./scenario-meta";

const EASE = [0.32, 0.72, 0, 1] as const;

export function SettledBanner({
  meta,
  bundle,
  ruling,
  rounds,
}: {
  meta: ScenarioMeta;
  bundle: Bundle | undefined;
  ruling: SignedRuling | undefined;
  rounds: number;
}) {
  if (!bundle) return null;
  const o = bundle.outcome;

  let kicker = "Settled";
  let credit = 0;
  let terms: string | undefined;
  let tint = "text-neon-green";

  if (o.kind === "converged") {
    kicker = "Settled by handshake";
    credit = o.final_state.credit_usd;
    terms = o.final_state.terms;
    tint = "text-neon-green";
  } else if (o.kind === "ruling") {
    kicker = "Closed by the bench";
    credit = o.ruling.remedy.credit_usd;
    terms = ruling?.remedy.terms ?? o.ruling.remedy.terms;
    tint = "text-amber-glow";
  } else {
    kicker = "Time ran out";
    terms = undefined;
    tint = "text-ash-gray";
  }

  const formatted =
    o.kind === "deadline" ? null : formatStateValue(meta.unit, credit);
  const headline = formatted ? formatted.primary : "Deadline";
  const isLong = headline.length > 10;
  const headlineSize = isLong
    ? "text-[36px] md:text-[52px]"
    : "text-[64px] md:text-[88px]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.95, ease: EASE }}
      className="relative overflow-hidden rounded-[36px] bg-polar-white/[0.02] p-1.5 ring-1 ring-polar-white/[0.06]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(closest-side at 30% 30%, rgba(231,197,154,0.10), transparent 60%), radial-gradient(closest-side at 80% 70%, rgba(0,172,92,0.08), transparent 60%)",
        }}
      />
      <div className="relative grid grid-cols-1 gap-10 rounded-[30px] bg-deep-space px-8 py-12 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:grid-cols-12 md:items-end md:px-12 md:py-16">
        <div className="md:col-span-7">
          <p className="text-[13px] italic text-ash-gray/70">{kicker}</p>
          <p
            className={[
              "mt-3 font-aeonik font-bold leading-[0.95] tracking-tight",
              headlineSize,
              tint,
            ].join(" ")}
          >
            {headline}
          </p>
          {formatted?.secondary ? (
            <p className="mt-2 text-[13px] italic text-ash-gray/65">
              {formatted.secondary}
            </p>
          ) : null}
          {terms ? (
            <p className="mt-5 max-w-[52ch] text-[16px] leading-[1.6] text-polar-white">
              {terms}
            </p>
          ) : null}
        </div>

        <div className="md:col-span-5 md:text-right">
          <dl className="grid gap-3 text-[13.5px] text-ash-gray md:inline-block md:text-left">
            <div className="flex items-baseline justify-between gap-8">
              <dt className="text-ash-gray/65 italic">Case</dt>
              <dd className="text-polar-white">{meta.title}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-8">
              <dt className="text-ash-gray/65 italic">Rounds</dt>
              <dd className="text-polar-white">{rounds}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-8">
              <dt className="text-ash-gray/65 italic">Outcome</dt>
              <dd className="text-polar-white">{o.kind}</dd>
            </div>
          </dl>
        </div>
      </div>
    </motion.div>
  );
}
