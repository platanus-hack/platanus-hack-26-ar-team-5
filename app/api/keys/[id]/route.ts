import { createSupabaseServer, requireUser } from "../../../../lib/auth/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const me = await requireUser();
  const { id } = await ctx.params;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", me.user.id)
    .is("revoked_at", null)
    .select("id");

  if (error) {
    return Response.json(
      { error: `Failed to revoke API key: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return Response.json({ error: "API key not found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
