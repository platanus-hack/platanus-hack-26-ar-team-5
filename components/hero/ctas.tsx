"use client";

import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

const SPRING = { stiffness: 240, damping: 22, mass: 0.5 };
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export function HeroCtas() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <PrimaryButton href="/demo">Run a demo</PrimaryButton>
      <GhostButton href="#how">See how it works</GhostButton>
    </div>
  );
}

/** Floating-pill primary with nested-icon island */
function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const tx = useSpring(useTransform(mx, (v) => v * 0.18), SPRING);
  const ty = useSpring(useTransform(my, (v) => v * 0.18), SPRING);

  function onMove(e: React.PointerEvent<HTMLAnchorElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set(e.clientX - r.left - r.width / 2);
    my.set(e.clientY - r.top - r.height / 2);
  }
  function onLeave() {
    mx.set(0);
    my.set(0);
  }

  return (
    <motion.a
      ref={ref}
      href={href}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ x: tx, y: ty, transition: `box-shadow 700ms ${EASE}` }}
      className="group relative inline-flex items-center gap-1.5 rounded-full bg-polar-white py-2 pl-5 pr-2 text-[14px] font-medium text-midnight-void shadow-[0_8px_30px_-12px_rgba(231,197,154,0.45)] active:scale-[0.98]"
    >
      <span>{children}</span>
      {/* Nested icon island */}
      <span
        className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-midnight-void/90 text-polar-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        style={{ transition: `transform 500ms ${EASE}` }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 17 17 7" />
          <path d="M9 7h8v8" />
        </svg>
      </span>
    </motion.a>
  );
}

function GhostButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-2 rounded-full border border-polar-white/10 bg-polar-white/[0.02] px-5 py-2.5 text-[14px] text-polar-white backdrop-blur-sm transition-colors hover:border-polar-white/20 hover:bg-polar-white/[0.05] active:scale-[0.98]"
      style={{ transition: `all 500ms ${EASE}` }}
    >
      <span>{children}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-ash-gray transition-transform group-hover:translate-y-0.5">
        <path d="M12 5v14" />
        <path d="m19 12-7 7-7-7" />
      </svg>
    </a>
  );
}
