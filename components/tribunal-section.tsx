"use client";

import { motion } from "framer-motion";
import { Eyebrow } from "./eyebrow";

const JURORS = [
  {
    initial: "AE",
    name: "Aequitas",
    weight: "Equity",
    body: "Asks: who is the smaller party? When the evidence is thin, leans toward the side with less power.",
    accent: "amber",
  },
  {
    initial: "UT",
    name: "Utilis",
    weight: "Utility",
    body: "Asks: which remedy keeps the relationship alive? Maximizes joint surplus and future cooperation.",
    accent: "white",
  },
  {
    initial: "VL",
    name: "Velox",
    weight: "Velocity",
    body: "Asks: what does the record actually say? Decides on the most-cited evidence and the cleanest target.",
    accent: "green",
  },
];

const ACCENT: Record<string, { ring: string; text: string }> = {
  amber: { ring: "ring-amber-glow/40", text: "text-amber-glow" },
  white: { ring: "ring-polar-white/30", text: "text-polar-white" },
  green: { ring: "ring-neon-green/40", text: "text-neon-green" },
};

const EASE = [0.32, 0.72, 0, 1] as const;

export function TribunalSection() {
  return (
    <section
      id="tribunal"
      aria-labelledby="tribunal-heading"
      className="relative mx-auto w-full max-w-7xl px-6 py-32 md:px-10 md:py-40"
    >
      <div className="grid grid-cols-1 gap-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <Eyebrow>When they can&apos;t agree</Eyebrow>
          <h2
            id="tribunal-heading"
            className="mt-5 font-aeonik text-[40px] font-bold leading-[1.02] tracking-[-0.02em] text-polar-white md:text-[56px]"
          >
            Three judges,
            <br />
            <span className="italic font-medium text-ash-gray/85">
              three minds, one ruling.
            </span>
          </h2>
          <p className="mt-6 max-w-[44ch] text-[16px] leading-[1.6] text-ash-gray">
            If the agents stall, Pacta hands the record to a small bench. Each
            judge runs on a different model and weighs the case differently.
            The majority closes it.
          </p>
        </div>

        <div className="md:col-span-7 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {JURORS.map((j, i) => (
            <motion.article
              key={j.name}
              initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.85, delay: i * 0.1, ease: EASE }}
              className={[
                "group rounded-[28px] bg-polar-white/[0.02] p-1.5 ring-1 ring-polar-white/[0.06]",
                i === 1 ? "sm:translate-y-8" : "",
              ].join(" ")}
            >
              <div className="flex h-full flex-col rounded-[22px] bg-deep-space p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-8">
                <div
                  className={[
                    "flex h-14 w-14 items-center justify-center rounded-full bg-midnight-void font-aeonik text-[15px] font-medium tracking-[0.04em] ring-1",
                    ACCENT[j.accent]!.ring,
                    ACCENT[j.accent]!.text,
                  ].join(" ")}
                >
                  {j.initial}
                </div>

                <h3 className="mt-7 font-aeonik text-[22px] font-medium text-polar-white">
                  {j.name}
                </h3>
                <p
                  className={`mt-1 text-[14px] italic ${ACCENT[j.accent]!.text}`}
                >
                  {j.weight}
                </p>

                <p className="mt-5 text-[14.5px] leading-[1.6] text-ash-gray">
                  {j.body}
                </p>

                <div className="mt-7 flex items-center gap-2 border-t border-polar-white/[0.06] pt-5 text-[13px] text-ash-gray/70">
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span
                      className="absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-60 pacta-ping"
                      style={{ animationDelay: `${i * 0.4}s` }}
                    />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-neon-green" />
                  </span>
                  <span className="italic">on the bench</span>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
