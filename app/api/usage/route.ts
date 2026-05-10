import { requireUser } from "../../../lib/auth/supabase-server";
import { getUserUsageSummary } from "../../../lib/auth/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_WINDOW_DAYS = 30;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 365;

function parseWindowDays(raw: string | null): number {
  if (!raw) return DEFAULT_WINDOW_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_WINDOW_DAYS;
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, parsed));
}

export async function GET(req: Request): Promise<Response> {
  const me = await requireUser();
  const url = new URL(req.url);
  const windowDays = parseWindowDays(url.searchParams.get("windowDays"));
  const summary = await getUserUsageSummary(me.profile, { windowDays });
  return Response.json(summary);
}
