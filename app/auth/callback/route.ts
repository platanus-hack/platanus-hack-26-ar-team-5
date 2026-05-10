/**
 * Supabase auth callback. Used by PKCE flows (password-reset emails, magic
 * links). Email/password sign-up and sign-in skip this path — they're handled
 * directly by the server actions in app/login/actions.ts.
 */
import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/auth/supabase-server";
import { promoteByEnv } from "../../../lib/auth/promote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  const userId = userData.user?.id;
  if (email && userId) {
    await promoteByEnv(userId, email);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
