"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "../../lib/auth/supabase-browser";

type Props = {
  next?: string;
};

export function GoogleSignInButton({ next = "/dashboard" }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthError) {
        setError(oauthError.message);
        setPending(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center justify-center gap-3 rounded-md border border-line/70 bg-graphite px-5 py-3 text-body text-polar-white transition-colors hover:border-line hover:bg-iron disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleGlyph className="h-4 w-4" />
        <span>{pending ? "Redirecting…" : "Continue with Google"}</span>
      </button>
      {error && (
        <p className="text-caption text-warn-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.7 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.3l-6.2-5.2C29.2 34.9 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.5l6.2 5.2C41 35.4 44 30.2 44 24c0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
