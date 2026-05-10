"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links: Array<{ href: string; label: string }> = [
  { href: "/dashboard", label: "Console" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/usage", label: "Usage" },
];

export function NavLinks() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="flex items-center gap-1">
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
            className={`rounded-md px-3 py-1.5 text-caption transition-colors ${
              active
                ? "bg-iron text-polar-white"
                : "text-ash-gray hover:bg-iron/60 hover:text-bone"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
