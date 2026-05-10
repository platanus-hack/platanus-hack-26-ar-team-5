import { requireUser } from "../../../lib/auth/supabase-server";
import { ApiKeysManager } from "../../../components/dashboard/api-keys-manager";

export const metadata = {
  title: "Pacta — Settings",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, profile } = await requireUser();
  const initials = (profile.full_name ?? user.email).slice(0, 1).toUpperCase();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="t-display text-polar-white">Settings</h1>
        <p className="t-label max-w-xl text-ash-gray">
          Mint and revoke API keys for the Pacta MCP and REST endpoints. Keys
          are shown once at creation — store them securely.
        </p>
      </header>

      <section className="flex items-center gap-4 rounded-lg border border-line/70 bg-graphite/40 p-4">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full border border-line/70 object-cover"
          />
        ) : (
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line/70 bg-iron text-body uppercase text-bone">
            {initials}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-body text-polar-white">
            {profile.full_name ?? user.email}
          </p>
          <p className="truncate text-caption text-ash-gray">{user.email}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-micro uppercase tracking-[0.14em] ${
            profile.allowed
              ? "border-pulse-green/40 bg-pulse-green/10 text-pulse-green"
              : "border-warn-red/40 bg-warn-red/10 text-warn-red"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              profile.allowed ? "bg-pulse-green" : "bg-warn-red"
            }`}
          />
          {profile.allowed ? "allowlisted" : "pending"}
        </span>
      </section>

      <ApiKeysManager allowed={profile.allowed} />
    </main>
  );
}
