"use client";

import { motion } from "framer-motion";
import { Eyebrow } from "./eyebrow";

const FACTS = [
  {
    k: "On the record",
    v: "Every offer is signed. Every move is timestamped. Nothing can be changed after the fact.",
  },
  {
    k: "Re-derivable",
    v: "Hand the bundle to anyone — they can replay the entire negotiation and verify it against the same rules.",
  },
  {
    k: "Always closes",
    v: "The case ends in a settlement or in a ruling — never in a thread that fizzles out.",
  },
];

const EASE = [0.32, 0.72, 0, 1] as const;

export function TrustStrip() {
  return (
    <section
      aria-label="What you walk away with"
      className="relative mx-auto w-full max-w-7xl px-6 py-32 md:px-10 md:py-40"
    >
      <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:items-end">
        <div className="md:col-span-5">
          <Eyebrow>What you walk away with</Eyebrow>
          <h2 className="mt-5 font-aeonik text-[40px] font-bold leading-[1.02] tracking-[-0.02em] text-polar-white md:text-[56px]">
            Not a transcript.
            <br />
            <span className="italic font-medium text-ash-gray/85">
              A receipt you can prove.
            </span>
          </h2>
        </div>

        <ul className="md:col-span-7 space-y-4">
          {FACTS.map((f, i) => (
            <motion.li
              key={f.k}
              initial={{ opacity: 0, y: 18, filter: "blur(4px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: EASE }}
              className="rounded-[22px] bg-polar-white/[0.02] p-1.5 ring-1 ring-polar-white/[0.06]"
            >
              <div className="grid grid-cols-12 items-baseline gap-4 rounded-[16px] bg-deep-space px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <span className="col-span-12 font-aeonik text-[16px] font-medium text-polar-white md:col-span-3">
                  {f.k}
                </span>
                <p className="col-span-12 text-[14.5px] leading-[1.6] text-ash-gray md:col-span-9">
                  {f.v}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
