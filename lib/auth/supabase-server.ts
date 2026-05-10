/**
 * Server-side Supabase client — reads cookies set by the OAuth callback so
 * Server Components and Route Handlers can identify the current user.
 *
 * Use cases:
 *   - Server Component (e.g. dashboard layout) → `getCurrentUser()`
 *   - Route Handler that requires session → `requireUser()` (throws redirect)
 *   - Mutating handlers (POST/DELETE) → `createSupabaseServer()` for RLS-bound
 *     queries, or fall through to `supabaseAdmin` when service-role is needed.
 */
import type { IncomingMessage } from "node:http";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createServerClient,
  parseCookieHeader,
  type CookieOptions,
} from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "./types";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[pacta-auth] Missing env var ${name}. See .env.example for the full list.`,
    );
  }
  return v;
}

export async function createSupabaseServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    envOrThrow("NEXT_PUBLIC_SUPABASE_URL"),
    envOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as CookieOptions);
            }
          } catch {
            // setAll throws when called from a Server Component (cookies are
            // immutable there). Safe to ignore — middleware/Route Handlers
            // are responsible for refreshing the cookie.
          }
        },
      },
    },
  );
}

export type CurrentUser = {
  user: { id: string; email: string };
  profile: Profile;
};

/**
 * Returns the signed-in user + profile, or null if no session.
 * Never throws — callers decide how to handle the unauthenticated case.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (error || !profile) return null;

  return {
    user: {
      id: userData.user.id,
      email: userData.user.email ?? profile.email,
    },
    profile: profile as Profile,
  };
}

/**
 * Server-side guard: returns the current user or redirects to /login.
 * Use from Server Components and Route Handlers that require a session.
 */
export async function requireUser(redirectTo = "/login"): Promise<CurrentUser> {
  const me = await getCurrentUser();
  if (!me) redirect(redirectTo);
  return me;
}

/**
 * Pages Router variant — `cookies()` from next/headers throws there because
 * Pages Router predates the request scope hooks. Parse the Cookie header
 * directly instead. Read-only: setAll is a no-op so no token refresh happens
 * inside Pages Router auth checks (the dashboard side handles refresh).
 */
export async function getCurrentUserFromRequest(
  req: IncomingMessage,
): Promise<CurrentUser | null> {
  const cookieHeader = req.headers.cookie ?? "";
  const supabase = createServerClient(
    envOrThrow("NEXT_PUBLIC_SUPABASE_URL"),
    envOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return parseCookieHeader(cookieHeader).map((c) => ({
            name: c.name,
            value: c.value ?? "",
          }));
        },
        setAll() {
          // no-op: Pages Router gate is read-only
        },
      },
    },
  );

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (error || !profile) return null;

  return {
    user: {
      id: userData.user.id,
      email: userData.user.email ?? profile.email,
    },
    profile: profile as Profile,
  };
}
