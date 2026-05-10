/**
 * Service-role Supabase client. Bypasses RLS — use ONLY from server code that
 * has already authenticated the request via a cookie session or X-Pacta-Key.
 *
 * Reasons we need it:
 *   - Insert into usage_events (no per-user insert policy).
 *   - Promote allow-listed emails on first sign-in.
 *   - Look up an api_keys row by hash without exposing the user_id constraint.
 *
 * Never import this from a Client Component or a Server Component that runs
 * in the browser bundle.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "[pacta-auth] SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is not set. Required for usage_events writes.",
    );
  }

  _admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
