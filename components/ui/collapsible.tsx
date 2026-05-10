"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Props = {
  defaultOpen?: boolean;
  /** Renders the toggle row. Receives the current open state so the trigger
   *  can swap a chevron / label / etc. The `<button>` chrome is provided. */
  trigger: (open: boolean) => ReactNode;
  triggerClassName?: string;
  children: ReactNode;
};

const ease = [0.16, 1, 0.3, 1] as const;

export function Collapsible({
  defaultOpen = false,
  trigger,
  triggerClassName = "flex w-full cursor-pointer items-center gap-2 text-left",
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={triggerClassName}
      >
        {trigger(open)}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease }}
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      animate={{ rotate: open ? 90 : 0 }}
      transition={{ duration: 0.18, ease }}
      className="h-3 w-3 shrink-0 text-ash-gray"
    >
      <path
        d="M4 3l4 3-4 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </motion.svg>
  );
}
