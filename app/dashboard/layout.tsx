import Link from "next/link";
import { requireUser } from "../../lib/auth/supabase-server";
import { LogoMark } from "../../components/ui/logo-mark";
import { NavLinks } from "../../components/dashboard/nav-links";
import { UserMenu } from "../../components/dashboard/user-menu";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireUser();

  return (
    <div className="flex min-h-screen flex-col bg-deep-space text-polar-white">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-deep-space/85 backdrop-blur supports-[backdrop-filter]:bg-deep-space/65">
        <div className="flex h-14 items-center gap-6 px-6">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2 text-polar-white transition-opacity hover:opacity-90"
          >
            <LogoMark className="h-4 w-4 text-polar-white" />
            <span className="t-label tracking-tight text-polar-white">
              Pacta
            </span>
          </Link>

          <span className="h-5 w-px bg-line/70" aria-hidden="true" />

          <NavLinks />

          <div className="ml-auto flex items-center gap-3">
            <UserMenu
              email={user.email}
              fullName={profile.full_name}
              avatarUrl={profile.avatar_url}
              allowed={profile.allowed}
            />
          </div>
        </div>
        {!profile.allowed && (
          <div className="border-t border-amber-glow/30 bg-amber-glow/[0.06]">
            <div className="flex items-center gap-2 px-6 py-2 text-caption text-amber-glow">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-glow"
                aria-hidden="true"
              />
              Your account is awaiting allowlist approval. You can browse, but
              you can&apos;t mint API keys or open new disputes.
            </div>
          </div>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
