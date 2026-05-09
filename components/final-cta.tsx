"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Eyebrow } from "./eyebrow";

const EASE = [0.32, 0.72, 0, 1] as const;

export function FinalCta() {
  return (
    <section
      aria-label="Open a case"
      className="relative mx-auto w-full max-w-7xl px-6 py-32 md:px-10 md:py-40"
    >
      <motion.div
        initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
        whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.95, ease: EASE }}
        className="relative overflow-hidden rounded-[36px] bg-polar-white/[0.02] p-1.5 ring-1 ring-polar-white/[0.06]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-32 -z-10"
          style={{
            background:
              "radial-gradient(closest-side at 30% 30%, rgba(231, 197, 154, 0.10), transparent 60%), radial-gradient(closest-side at 80% 70%, rgba(0, 172, 92, 0.06), transparent 60%)",
          }}
        />
        <div className="relative grid grid-cols-1 items-end gap-12 rounded-[30px] bg-deep-space px-8 py-14 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:grid-cols-12 md:px-14 md:py-20">
          <div className="md:col-span-8">
            <Eyebrow>Open a case</Eyebrow>
            <h2 className="mt-6 max-w-[16ch] font-aeonik text-[42px] font-bold leading-[1.02] tracking-[-0.02em] text-polar-white md:text-[64px]">
              Watch two AI agents settle{" "}
              <span className="italic font-medium text-ash-gray/85">
                a $180k overrun
              </span>{" "}
              in four turns.
            </h2>
          </div>

          <div className="md:col-span-4 md:flex md:justify-end">
            <Link
              href="/demo?scenario=ai-overrun"
              className="group inline-flex items-center gap-1.5 rounded-full bg-polar-white py-2 pl-6 pr-2 text-[14px] font-medium text-midnight-void shadow-[0_8px_30px_-12px_rgba(231,197,154,0.55)] active:scale-[0.98]"
              style={{ transition: `transform 500ms cubic-bezier(0.32, 0.72, 0, 1)` }}
            >
              Open the case
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-midnight-void text-polar-white"
                style={{
                  transition: `transform 500ms cubic-bezier(0.32, 0.72, 0, 1)`,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                  <path d="M7 17 17 7" />
                  <path d="M9 7h8v8" />
                </svg>
              </span>
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
