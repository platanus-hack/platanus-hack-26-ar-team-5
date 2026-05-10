"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const links: Array<{ href: string; label: string }> = [
  { href: "/dashboard", label: "Console" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/usage", label: "Usage" },
];

export function NavLinks() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="flex items-center gap-1 text-caption">
      {links.map((l) => {
        const active =
          l.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-md px-2.5 py-1 text-caption transition-colors duration-150 ${
              active
                ? "text-polar-white"
                : "text-ash-gray hover:text-bone"
            }`}
          >
            {l.label}
            {active && (
              <motion.span
                layoutId="nav-underline"
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-[15px] left-2 right-2 h-px bg-polar-white"
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
