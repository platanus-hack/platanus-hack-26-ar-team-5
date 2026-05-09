"use client";

import { motion } from "framer-motion";
import { Eyebrow } from "./eyebrow";

const STEPS = [
  {
    n: "01",
    title: "You frame the dispute.",
    body: "Pick a case. Pacta seeds two AI agents — one for each side — with their own goals, constraints, and a small library of evidence.",
  },
  {
    n: "02",
    title: "They negotiate by the rules.",
    body: "Each turn, an agent makes an offer or pushes back. The protocol enforces compromise: no agent can move toward themselves, only toward the other side.",
  },
  {
    n: "03",
    title: "It ends with a settlement.",
    body: "When both agents accept the same offer, the deal binds. If they can't agree, three judges read the record and rule — the case closes either way.",
  },
];

const EASE = [0.32, 0.72, 0, 1] as const;

export function HowItWorks() {
  return (
    <section
      id="how"
      aria-labelledby="how-heading"
      className="relative mx-auto w-full max-w-7xl px-6 py-32 md:px-10 md:py-40"
    >
      <div className="grid grid-cols-1 gap-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <Eyebrow>How it works</Eyebrow>
          <h2
            id="how-heading"
            className="mt-5 font-aeonik text-[40px] font-bold leading-[1.02] tracking-[-0.02em] text-polar-white md:text-[56px]"
          >
            Two parties.
            <br />
            <span className="italic font-medium text-ash-gray/85">
              One ledger. One outcome.
            </span>
          </h2>
        </div>

        <div className="md:col-span-7 space-y-4">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.85, delay: i * 0.12, ease: EASE }}
              className="rounded-[28px] bg-polar-white/[0.02] p-1.5 ring-1 ring-polar-white/[0.06]"
            >
              <article className="grid grid-cols-12 items-baseline gap-6 rounded-[22px] bg-deep-space p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-9">
                <div className="col-span-12 md:col-span-2">
                  <p className="font-aeonik text-[44px] font-bold italic leading-none tracking-tight text-amber-glow/80">
                    {s.n}
                  </p>
                </div>
                <div className="col-span-12 md:col-span-10">
                  <h3 className="font-aeonik text-[22px] font-medium text-polar-white md:text-[26px]">
                    {s.title}
                  </h3>
                  <p className="mt-3 max-w-[58ch] text-[15px] leading-[1.6] text-ash-gray">
                    {s.body}
                  </p>
                </div>
              </article>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
