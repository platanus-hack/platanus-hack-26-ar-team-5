/**
 * Supabase OAuth callback. Supabase redirects here with `?code=...` after the
 * Google sign-in flow; we exchange it for a session, then promote the
 * profile if its email is on ALLOWED_EMAILS.
 */
import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/auth/supabase-server";
import { getSupabaseAdmin } from "../../../lib/auth/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseAllowedEmails(): Set<string> {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";
  const errorDescription = url.searchParams.get("error_description");

  if (errorDescription) {
    const back = new URL("/login", url.origin);
    back.searchParams.set("error", errorDescription);
    return NextResponse.redirect(back);
  }

  if (!code) {
    const back = new URL("/login", url.origin);
    back.searchParams.set("error", "Missing authorization code.");
    return NextResponse.redirect(back);
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const back = new URL("/login", url.origin);
    back.searchParams.set("error", error.message);
    return NextResponse.redirect(back);
  }

  // Auto-promote if the user's email is on the env allowlist. The
  // handle_new_user trigger has already inserted the profile row, so we just
  // flip `allowed`.
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email?.toLowerCase();
  const userId = userData.user?.id;
  if (email && userId && parseAllowedEmails().has(email)) {
    const { error: promoteErr } = await getSupabaseAdmin()
      .from("profiles")
      .update({ allowed: true })
      .eq("id", userId);
    if (promoteErr) {
      console.error("[pacta-auth] allowlist promote failed:", promoteErr.message);
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
