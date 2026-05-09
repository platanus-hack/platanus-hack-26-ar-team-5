"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4 md:pt-6"
      style={{ transition: `all 600ms ${EASE}` }}
    >
      <div
        className={[
          "flex w-full max-w-[760px] items-center justify-between gap-6 rounded-full border border-polar-white/10 px-3 py-2 backdrop-blur-xl",
          scrolled
            ? "bg-midnight-void/75 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)]"
            : "bg-midnight-void/50",
        ].join(" ")}
        style={{ transition: `all 600ms ${EASE}` }}
      >
        <Link
          href="/"
          className="ml-2 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-polar-white"
          aria-label="Pacta — home"
        >
          <span
            aria-hidden
            className="relative inline-flex h-2.5 w-2.5 items-center justify-center"
          >
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-glow opacity-50 pacta-ping" />
            <span className="relative inline-block h-2 w-2 rounded-full bg-amber-glow" />
          </span>
          Pacta
        </Link>

        <nav aria-label="primary" className="hidden items-center gap-7 md:flex">
          <Link
            href="#how"
            className="text-[13px] text-ash-gray transition-colors hover:text-polar-white"
          >
            How it works
          </Link>
          <Link
            href="#cases"
            className="text-[13px] text-ash-gray transition-colors hover:text-polar-white"
          >
            Cases
          </Link>
          <Link
            href="#tribunal"
            className="text-[13px] text-ash-gray transition-colors hover:text-polar-white"
          >
            Tribunal
          </Link>
        </nav>

        <Link
          href="/demo"
          className="group inline-flex items-center gap-1.5 rounded-full bg-polar-white py-1.5 pl-4 pr-1.5 text-[13px] font-medium text-midnight-void active:scale-[0.98]"
          style={{ transition: `transform 400ms ${EASE}` }}
        >
          Run a demo
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-midnight-void text-polar-white"
            style={{ transition: `transform 500ms ${EASE}` }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
              <path d="M7 17 17 7" />
              <path d="M9 7h8v8" />
            </svg>
          </span>
        </Link>
      </div>
    </header>
  );
}
