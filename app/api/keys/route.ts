import { createSupabaseServer, requireUser } from "../../../lib/auth/supabase-server";
import { generateApiKey } from "../../../lib/auth/api-auth";
import type { ApiKey, ApiKeyPublic } from "../../../lib/auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const me = await requireUser();
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("user_id", me.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json(
      { error: `Failed to list API keys: ${error.message}` },
      { status: 500 },
    );
  }

  const keys: ApiKeyPublic[] = ((data ?? []) as ApiKey[]).map((row) => {
    const { key_hash: _key_hash, ...publicFields } = row;
    return publicFields;
  });

  return Response.json({ keys });
}

export async function POST(req: Request): Promise<Response> {
  const me = await requireUser();

  if (!me.profile.allowed) {
    return Response.json({ error: "Account not on allowlist." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name =
    body && typeof body === "object" && "name" in body
      ? (body as { name: unknown }).name
      : undefined;

  if (typeof name !== "string") {
    return Response.json(
      { error: "`name` must be a string." },
      { status: 400 },
    );
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) {
    return Response.json(
      { error: "`name` must be a non-empty string up to 80 characters." },
      { status: 400 },
    );
  }

  const { plaintext, hash, prefix } = generateApiKey();

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: me.user.id,
      name: trimmed,
      prefix,
      key_hash: hash,
    })
    .select("*")
    .single();

  if (error || !data) {
    return Response.json(
      { error: `Failed to create API key: ${error?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }

  const row = data as ApiKey;
  const { key_hash: _key_hash, ...publicFields } = row;
  const key: ApiKeyPublic = { ...publicFields, plaintext };

  return Response.json({ key });
}
