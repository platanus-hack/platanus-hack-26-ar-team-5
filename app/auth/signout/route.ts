import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/auth/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", new URL(req.url).origin), {
    status: 303,
  });
}
