"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { SignedRuling, SignedVote } from "../../src/types";

const OUTCOME_TINT: Record<string, string> = {
  claimant_prevails: "text-neon-green",
  claimant_partial: "text-amber-glow",
  respondent_prevails: "text-slate",
  abstain: "text-ash-gray",
};

const cardSpring = { type: "spring", stiffness: 130, damping: 20 } as const;

function shortDid(d: string) {
  return d.length > 30 ? `${d.slice(0, 15)}…${d.slice(-6)}` : d;
}

export function JuryPanel({
  votes,
  ruling,
  active,
}: {
  votes: SignedVote[];
  ruling: SignedRuling | undefined;
  active: boolean;
}) {
  if (!active) return null;

  return (
    <motion.section
      layoutId="tribunal"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={cardSpring}
      className="mt-6 rounded-lg border border-amber-glow/40 bg-deep-space p-6 md:p-8"
      aria-labelledby="jury-heading"
    >
      <div className="flex items-center justify-between">
        <h3
          id="jury-heading"
          className="font-input text-caption uppercase tracking-tight text-amber-glow"
        >
          tribunal · deliberation in progress
        </h3>
        <span className="font-input text-caption text-ash-gray">
          {votes.length} / 3 votes
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <AnimatePresence>
          {votes.map((v, i) => (
            <motion.article
              key={v.juror_did + i}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...cardSpring, delay: i * 0.08 }}
              className="rounded-md border border-dark-carbon bg-midnight-void p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-aeonik text-heading-sm font-bold text-polar-white">
                  {v.juror}
                </span>
                <span className="font-input text-caption text-ash-gray">
                  conf {v.confidence.toFixed(2)}
                </span>
              </div>
              <p className="mt-1 font-input text-caption text-dark-carbon">
                {v.juror_model}
              </p>
              <p
                className={[
                  "mt-3 font-input text-caption uppercase tracking-tight",
                  OUTCOME_TINT[v.outcome] ?? "text-polar-white",
                ].join(" ")}
              >
                {v.outcome.replace(/_/g, " ")}
              </p>
              <p className="mt-3 text-[13px] leading-[1.5] text-ash-gray">
                {v.rationale.length > 220
                  ? v.rationale.slice(0, 220) + "…"
                  : v.rationale}
              </p>
              <p className="mt-3 font-input text-caption text-dark-carbon">
                {shortDid(v.juror_did)}
              </p>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>

      {ruling ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={cardSpring}
          className="mt-6 rounded-md border border-neon-green/50 bg-midnight-void p-5"
        >
          <div className="flex items-center justify-between">
            <span className="font-input text-caption uppercase tracking-tight text-neon-green">
              ruling
            </span>
            <span className="font-input text-caption text-ash-gray">
              conf {ruling.confidence.toFixed(2)}
            </span>
          </div>
          <p
            className={[
              "mt-2 font-aeonik text-heading-sm font-bold uppercase tracking-tight",
              OUTCOME_TINT[ruling.outcome] ?? "text-polar-white",
            ].join(" ")}
          >
            {ruling.outcome.replace(/_/g, " ")}
          </p>
          <p className="mt-3 text-[14px] leading-[1.55] text-polar-white">
            remedy · credit_usd ${ruling.remedy.credit_usd.toLocaleString()} —{" "}
            <span className="text-ash-gray">{ruling.remedy.terms}</span>
          </p>
          {ruling.rationale ? (
            <p className="mt-3 text-[14px] leading-[1.55] text-ash-gray italic">
              “{ruling.rationale}”
            </p>
          ) : null}
        </motion.div>
      ) : null}
    </motion.section>
  );
}
