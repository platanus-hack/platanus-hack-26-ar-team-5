/**
 * Browser-side Supabase client. Used from Client Components (settings page,
 * usage page, user menu) for actions that should run with the user's session
 * cookie — e.g. signing out, kicking off the OAuth redirect.
 *
 * RLS gates everything sensitive, so the anon key is safe in the browser.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "[pacta-auth] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set in the browser bundle. Restart `next dev` after editing .env.local.",
    );
  }

  _client = createBrowserClient(url, anon);
  return _client;
}
