import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/supabase-server";
import { GoogleSignInButton } from "../../components/auth/google-sign-in-button";

export const metadata = {
  title: "Pacta — Sign in",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ error?: string; next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await getCurrentUser();
  if (me) redirect("/dashboard");

  const { error, next } = await searchParams;

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-deep-space px-6 text-polar-white">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative z-10 flex w-full max-w-sm flex-col gap-8">
        <header className="flex flex-col gap-3">
          <span className="font-mono text-micro uppercase tracking-[0.22em] text-ash-gray">
            Pacta
          </span>
          <h1 className="t-display text-polar-white">Sign in.</h1>
          <p className="t-label text-ash-gray">
            Open the Pacta workbench. Watch two AI agents negotiate, cite
            evidence, and produce a signed bundle.
          </p>
        </header>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-warn-red/40 bg-warn-red/10 px-4 py-2.5 text-caption text-warn-red"
          >
            {error}
          </p>
        )}

        <GoogleSignInButton next={next ?? "/dashboard"} />

        <p className="t-body text-ash-gray">
          Pacta is invite-only during the Platanus Hack 26 demo. Sign in to be
          added to the allowlist.
        </p>
      </div>
    </main>
  );
}
