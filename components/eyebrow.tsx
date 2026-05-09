import type { ReactNode } from "react";

const ACCENT = {
  amber: "bg-amber-glow",
  green: "bg-neon-green",
  white: "bg-polar-white/70",
} as const;

export function Eyebrow({
  children,
  accent = "amber",
}: {
  children: ReactNode;
  accent?: keyof typeof ACCENT;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-polar-white/10 bg-polar-white/[0.03] px-3 py-1 text-[12px] font-medium tracking-tight text-ash-gray">
      <span aria-hidden className={`h-1 w-1 rounded-full ${ACCENT[accent]}`} />
      <span className="leading-none">{children}</span>
    </span>
  );
}
