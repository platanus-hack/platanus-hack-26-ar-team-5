"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Transcript, type TranscriptEntry } from "./transcript";
import { UtilityCurve, type UtilityPoint } from "./utility-curve";
import { EvidenceLedger } from "./evidence-ledger";
import { JuryPanel } from "./jury-panel";
import { BundleCard } from "./bundle-card";
import type { Bundle, SignedRuling, SignedVote } from "../../src/types";

const EASE = [0.32, 0.72, 0, 1] as const;

export function AuditTrail({
  transcript,
  utilities,
  evidence,
  votes,
  ruling,
  juryActive,
  bundle,
}: {
  transcript: TranscriptEntry[];
  utilities: UtilityPoint[];
  evidence: Array<{ id: string; tier: string; hash: string }>;
  votes: SignedVote[];
  ruling: SignedRuling | undefined;
  juryActive: boolean;
  bundle: Bundle | undefined;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-12">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group inline-flex items-center gap-2 rounded-full border border-polar-white/10 bg-polar-white/[0.03] px-4 py-2 text-[13px] text-polar-white transition-colors hover:border-polar-white/20 hover:bg-polar-white/[0.06]"
        aria-expanded={open}
      >
        <span
          className={[
            "inline-flex h-5 w-5 items-center justify-center rounded-full bg-midnight-void text-ash-gray transition-transform",
            open ? "rotate-45" : "",
          ].join(" ")}
          style={{ transition: `transform 400ms ${EASE.join(",")}` }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </span>
        <span>{open ? "Hide audit trail" : "Show audit trail"}</span>
        <span className="text-[12px] italic text-ash-gray/65">
          hashes, signatures, raw events
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8">
                <Transcript entries={transcript} />
                <div className="mt-6">
                  <JuryPanel
                    votes={votes}
                    ruling={ruling}
                    active={juryActive}
                  />
                </div>
              </div>
              <div className="space-y-6 lg:col-span-4">
                <UtilityCurve points={utilities} />
                <EvidenceLedger items={evidence} />
                <BundleCard bundle={bundle} />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
