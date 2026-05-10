/**
 * Allowlist / admin promotion based on env. Called from every successful
 * sign-in or sign-up so a freshly-created profile lands with the right flags
 * without manual SQL.
 *
 *   ALLOWED_EMAILS  → allowed=true
 *   ADMIN_EMAILS    → allowed=true + bumped monthly quotas
 *
 * ADMIN_EMAILS is a strict superset privilege over ALLOWED_EMAILS — an email
 * on both lists gets the admin treatment.
 */
import { getSupabaseAdmin } from "./supabase-admin";

const ADMIN_QUOTA_DISPUTES = 500;
const ADMIN_QUOTA_TOKENS = 10_000_000;

function parseEmails(envName: string): Set<string> {
  const raw = process.env[envName] ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function promoteByEnv(
  userId: string,
  email: string,
): Promise<void> {
  const lower = email.toLowerCase();
  const isAdmin = parseEmails("ADMIN_EMAILS").has(lower);
  const isAllowed = isAdmin || parseEmails("ALLOWED_EMAILS").has(lower);
  if (!isAllowed) return;

  const update = isAdmin
    ? {
        allowed: true,
        monthly_quota_disputes: ADMIN_QUOTA_DISPUTES,
        monthly_quota_tokens: ADMIN_QUOTA_TOKENS,
      }
    : { allowed: true };

  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .update(update)
    .eq("id", userId);

  if (error) {
    console.error("[pacta-auth] promote failed:", error.message);
  }
}
