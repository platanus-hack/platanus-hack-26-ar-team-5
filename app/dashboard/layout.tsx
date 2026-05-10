import Link from "next/link";
import { requireUser } from "../../lib/auth/supabase-server";
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
    <div className="min-h-screen bg-deep-space text-polar-white">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-deep-space/80 backdrop-blur">
        <div className="flex h-12 items-center justify-between gap-4 px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="font-mono text-micro uppercase tracking-[0.2em] text-bone">
              PACTA
            </span>
          </Link>
          <NavLinks />
          <UserMenu
            email={user.email}
            fullName={profile.full_name}
            avatarUrl={profile.avatar_url}
            allowed={profile.allowed}
          />
        </div>
        {!profile.allowed && (
          <div className="border-t border-amber-glow/40 bg-amber-glow/5 px-6 py-2 text-caption text-amber-glow">
            Your account is awaiting allowlist approval. You can browse, but
            you can&apos;t mint API keys or open new disputes.
          </div>
        )}
      </header>
      {children}
    </div>
  );
}
