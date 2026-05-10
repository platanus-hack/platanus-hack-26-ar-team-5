import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/supabase-server";
import { signInAction, signUpAction } from "./actions";

export const metadata = {
  title: "Pacta — Sign in",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  mode?: "signin" | "signup";
  error?: string;
  info?: string;
  email?: string;
  next?: string;
}>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await getCurrentUser();
  if (me) redirect("/dashboard");

  const params = await searchParams;
  const mode = params.mode === "signup" ? "signup" : "signin";
  const { error, info, email } = params;

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-deep-space px-6 text-polar-white">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative z-10 flex w-full max-w-sm flex-col gap-8">
        <header className="flex flex-col gap-3">
          <span className="font-mono text-micro uppercase tracking-[0.22em] text-ash-gray">
            Pacta
          </span>
          <h1 className="t-display text-polar-white">
            {mode === "signup" ? "Create account." : "Sign in."}
          </h1>
          <p className="t-label text-ash-gray">
            {mode === "signup"
              ? "Sign up to mint API keys and watch two AI agents negotiate, cite evidence, and produce a signed bundle."
              : "Open the Pacta workbench. Mint API keys, run disputes, audit the signed bundle."}
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
        {info && (
          <p
            role="status"
            className="rounded-md border border-amber-glow/40 bg-amber-glow/5 px-4 py-2.5 text-caption text-amber-glow"
          >
            {info}
          </p>
        )}

        {mode === "signup" ? (
          <SignUpForm defaultEmail={email} />
        ) : (
          <SignInForm defaultEmail={email} />
        )}

        <p className="text-caption text-ash-gray">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-bone underline decoration-line/60 underline-offset-4 hover:text-polar-white"
              >
                Sign in
              </Link>
              .
            </>
          ) : (
            <>
              No account yet?{" "}
              <Link
                href="/login?mode=signup"
                className="text-bone underline decoration-line/60 underline-offset-4 hover:text-polar-white"
              >
                Create one
              </Link>
              .
            </>
          )}
        </p>

        <p className="t-body text-dim">
          Pacta is invite-only during the Platanus Hack 26 demo. Accounts not
          on the allowlist can browse the dashboard but can&apos;t mint API
          keys or open disputes.
        </p>
      </div>
    </main>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-micro uppercase tracking-[0.16em] text-ash-gray">
      {children}
    </span>
  );
}

function inputClassName() {
  return "rounded-md border border-line bg-graphite/60 px-3 py-2.5 text-body text-polar-white placeholder:text-dim outline-none focus:border-amber-glow/60 focus:bg-graphite";
}

function submitClassName() {
  return "mt-1 rounded-md bg-polar-white px-4 py-2.5 text-body font-medium text-deep-space transition-colors hover:bg-bone disabled:opacity-50";
}

function SignInForm({ defaultEmail }: { defaultEmail?: string }) {
  return (
    <form action={signInAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Email</FieldLabel>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus={!defaultEmail}
          defaultValue={defaultEmail}
          className={inputClassName()}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Password</FieldLabel>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          autoFocus={Boolean(defaultEmail)}
          className={inputClassName()}
        />
      </label>
      <button type="submit" className={submitClassName()}>
        Sign in
      </button>
    </form>
  );
}

function SignUpForm({ defaultEmail }: { defaultEmail?: string }) {
  return (
    <form action={signUpAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Full name (optional)</FieldLabel>
        <input
          name="full_name"
          type="text"
          autoComplete="name"
          className={inputClassName()}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Email</FieldLabel>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={defaultEmail}
          className={inputClassName()}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Password</FieldLabel>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClassName()}
        />
        <span className="text-micro text-dim">8 characters minimum.</span>
      </label>
      <button type="submit" className={submitClassName()}>
        Create account
      </button>
    </form>
  );
}
