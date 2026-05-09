"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

const SPRING = { stiffness: 180, damping: 22, mass: 0.5 };
const EASE = [0.32, 0.72, 0, 1] as const;

export type ScenarioCardData = {
  id: string;
  index: number;
  framing: string;
  partyA: string;
  partyB: string;
  body: string;
  metric: string;
  metricLabel: string;
  outcome: string;
  span?: string;
  accent: "amber" | "white" | "green" | "rose";
};

const ACCENT: Record<ScenarioCardData["accent"], string> = {
  amber: "text-amber-glow",
  white: "text-polar-white",
  green: "text-neon-green",
  rose: "text-[#E89AAA]",
};

export function ScenarioCard(props: ScenarioCardData) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotX = useSpring(useTransform(my, [0, 1], [3, -3]), SPRING);
  const rotY = useSpring(useTransform(mx, [0, 1], [-3, 3]), SPRING);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    mx.set(px);
    my.set(py);
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
  }
  function onLeave() {
    mx.set(0.5);
    my.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{
        rotateX: rotX,
        rotateY: rotY,
        transformPerspective: 1000,
        transformStyle: "preserve-3d",
      }}
      initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.8, delay: props.index * 0.06, ease: EASE }}
      className={[
        "group relative h-full rounded-[28px] bg-polar-white/[0.02] p-1.5 ring-1 ring-polar-white/[0.06] will-change-transform",
        props.span ?? "",
      ].join(" ")}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[28px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(420px circle at var(--mx,50%) var(--my,50%), rgba(231,197,154,0.10), transparent 55%)",
        }}
      />

      <article className="relative flex h-full flex-col justify-between rounded-[22px] bg-deep-space p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-10">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-ash-gray/70">
              <span className="text-polar-white/85">Case {String(props.index + 1).padStart(2, "0")}</span>
              <span className="mx-2 text-ash-gray/40">/</span>
              <span className="italic">{props.id}</span>
            </p>
            <span aria-hidden className={`text-[10px] ${ACCENT[props.accent]}`}>
              ●
            </span>
          </div>

          <h3 className="mt-7 font-aeonik text-[24px] font-medium leading-[1.15] tracking-tight text-polar-white md:text-[28px]">
            {props.framing}
          </h3>

          <p className="mt-3 max-w-[44ch] text-[14.5px] leading-[1.55] text-ash-gray">
            {props.body}
          </p>

          <div className="mt-7 flex items-baseline gap-4 border-t border-polar-white/[0.06] pt-5">
            <div>
              <p className={`font-aeonik text-[34px] font-bold leading-none tracking-tight ${ACCENT[props.accent]}`}>
                {props.metric}
              </p>
              <p className="mt-1.5 text-[13px] italic text-ash-gray/70">
                {props.metricLabel}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[14px] text-polar-white">{props.partyA}</p>
              <p className="text-[12px] italic text-ash-gray/55">vs</p>
              <p className="text-[14px] text-polar-white">{props.partyB}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <span className="text-[13.5px] italic text-ash-gray/85">{props.outcome}</span>
          <Link
            href={`/demo?scenario=${props.id}`}
            className="group/btn inline-flex items-center gap-1.5 rounded-full border border-polar-white/10 bg-polar-white/[0.04] py-1.5 pl-4 pr-1.5 text-[13px] text-polar-white transition-all hover:border-polar-white/25 hover:bg-polar-white/[0.08] active:scale-[0.98]"
          >
            Open
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-polar-white text-midnight-void transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 17 17 7" />
                <path d="M9 7h8v8" />
              </svg>
            </span>
          </Link>
        </div>
      </article>
    </motion.div>
  );
}
