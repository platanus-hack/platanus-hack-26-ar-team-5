"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Props = {
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  allowed: boolean;
};

export function UserMenu({ email, fullName, avatarUrl, allowed }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = (fullName ?? email).slice(0, 1).toUpperCase();

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-caption text-ash-gray transition-colors hover:bg-iron/70 hover:text-bone"
      >
        <Avatar src={avatarUrl} initials={initials} />
        <span className="hidden max-w-[160px] truncate sm:inline">
          {email}
        </span>
        <Caret open={open} />
      </button>

      <AnimatePresence>
      {open && (
        <motion.div
          role="menu"
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="origin-top-right absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-md border border-line/70 bg-graphite shadow-xl"
        >
          <div className="flex items-center gap-3 border-b border-line/70 px-4 py-3">
            <Avatar src={avatarUrl} initials={initials} large />
            <div className="min-w-0">
              <p className="truncate text-caption text-polar-white">
                {fullName ?? email}
              </p>
              <p className="truncate text-micro text-ash-gray">{email}</p>
              <p className="mt-1.5 inline-flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    allowed ? "bg-pulse-green" : "bg-warn-red"
                  }`}
                />
                <span
                  className={`text-micro uppercase tracking-[0.14em] ${
                    allowed ? "text-pulse-green" : "text-warn-red"
                  }`}
                >
                  {allowed ? "allowlisted" : "pending review"}
                </span>
              </p>
            </div>
          </div>
          <form action="/auth/signout" method="post" className="block">
            <button
              type="submit"
              className="block w-full px-4 py-2.5 text-left text-caption text-bone transition-colors hover:bg-iron hover:text-polar-white"
            >
              Sign out
            </button>
          </form>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

function Avatar({
  src,
  initials,
  large,
}: {
  src: string | null;
  initials: string;
  large?: boolean;
}) {
  const size = large ? "h-9 w-9" : "h-6 w-6";
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${size} shrink-0 rounded-full border border-line/70 object-cover`}
      />
    );
  }
  return (
    <span
      className={`${size} inline-flex shrink-0 items-center justify-center rounded-full border border-line/70 bg-iron text-micro uppercase text-bone`}
    >
      {initials}
    </span>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 text-ash-gray transition-transform ${
        open ? "rotate-180" : ""
      }`}
      aria-hidden="true"
    >
      <path
        d="M3 4.5l3 3 3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
