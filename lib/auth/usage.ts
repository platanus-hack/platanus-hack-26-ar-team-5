/**
 * Usage tracking — writes to usage_events via the service-role client,
 * aggregates summaries for the dashboard, and enforces monthly quotas.
 *
 * The async-local-storage context lets the dispute engine attribute per-turn
 * Claude token spend back to the user that originated the HTTP request, even
 * though the engine itself has no idea about users.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { getSupabaseAdmin } from "./supabase-admin";
import { estimateCostUsd } from "./pricing";
import type { Profile, UsageEvent, UsageSummary } from "./types";

// ---------------------------------------------------------------------------
// Per-request context
// ---------------------------------------------------------------------------

export type RequestAttribution = {
  user_id: string;
  api_key_id: string | null;
  endpoint: string;
  method: string;
};

const als = new AsyncLocalStorage<RequestAttribution>();

export function runWithAttribution<T>(
  attribution: RequestAttribution,
  fn: () => Promise<T>,
): Promise<T> {
  return als.run(attribution, fn);
}

export function getCurrentAttribution(): RequestAttribution | undefined {
  return als.getStore();
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export type RecordUsageInput = {
  user_id: string;
  api_key_id?: string | null;
  endpoint: string;
  method: string;
  status: number;
  dispute_id?: string | null;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  /** Optional model id for automatic cost estimation. Ignored if cost_usd is set. */
  model?: string;
};

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  const tokens_in = input.tokens_in ?? 0;
  const tokens_out = input.tokens_out ?? 0;
  const cost_usd =
    input.cost_usd ??
    (tokens_in + tokens_out > 0
      ? estimateCostUsd(input.model, tokens_in, tokens_out)
      : 0);

  const { error } = await getSupabaseAdmin().from("usage_events").insert({
    user_id: input.user_id,
    api_key_id: input.api_key_id ?? null,
    endpoint: input.endpoint,
    method: input.method,
    status: input.status,
    dispute_id: input.dispute_id ?? null,
    tokens_in,
    tokens_out,
    cost_usd,
  });

  if (error) {
    // Never block the request on a usage-write failure — log and move on.
    console.error("[pacta-usage] recordUsage failed:", error.message);
  }
}

/**
 * Convenience for instrumented Claude calls inside the dispute engine.
 * Reads the request attribution from AsyncLocalStorage; no-op when called
 * outside a gated request (e.g. from `pnpm demo`).
 */
export async function recordClaudeTurn(args: {
  model?: string;
  tokens_in: number;
  tokens_out: number;
  dispute_id?: string;
}): Promise<void> {
  const attr = getCurrentAttribution();
  if (!attr) return;
  await recordUsage({
    user_id: attr.user_id,
    api_key_id: attr.api_key_id,
    endpoint: `${attr.endpoint}#claude`,
    method: attr.method,
    status: 200,
    dispute_id: args.dispute_id ?? null,
    tokens_in: args.tokens_in,
    tokens_out: args.tokens_out,
    model: args.model,
  });
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

function monthStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function getUserUsageSummary(
  profile: Profile,
  opts?: { windowDays?: number },
): Promise<UsageSummary> {
  const admin = getSupabaseAdmin();
  const now = new Date();
  const windowDays = opts?.windowDays ?? 30;
  const windowStart = new Date(now.getTime() - windowDays * MS_PER_DAY);

  const monthStartIso = monthStart(now).toISOString();
  const windowStartIso = windowStart.toISOString();

  // Window rows — we use these for totals + by_endpoint + recent.
  const { data: rows, error } = await admin
    .from("usage_events")
    .select(
      "id,user_id,api_key_id,endpoint,method,status,dispute_id,tokens_in,tokens_out,cost_usd,ts",
    )
    .eq("user_id", profile.id)
    .gte("ts", windowStartIso)
    .order("ts", { ascending: false });

  if (error) throw new Error(`usage query failed: ${error.message}`);

  const events = (rows ?? []) as UsageEvent[];

  let requests = 0;
  let disputes_opened = 0;
  let messages_sent = 0;
  let tokens_in = 0;
  let tokens_out = 0;
  let cost_usd = 0;
  const byEndpoint = new Map<
    string,
    { requests: number; last_used_at: string | null }
  >();

  for (const e of events) {
    requests += 1;
    tokens_in += e.tokens_in;
    tokens_out += e.tokens_out;
    cost_usd += Number(e.cost_usd);
    const slot = byEndpoint.get(e.endpoint) ?? {
      requests: 0,
      last_used_at: null,
    };
    slot.requests += 1;
    if (!slot.last_used_at || e.ts > slot.last_used_at) {
      slot.last_used_at = e.ts;
    }
    byEndpoint.set(e.endpoint, slot);

    if (e.endpoint === "/api/disputes" && e.method === "POST" && e.status < 400)
      disputes_opened += 1;
    if (e.endpoint === "/api/mcp" && e.method === "POST" && e.status < 400)
      messages_sent += 1;
  }

  // Quota counts the calendar-month window, independent of the rolling window
  // above. Cheap to compute since usage_events is small per user.
  const { data: monthRows, error: monthErr } = await admin
    .from("usage_events")
    .select("endpoint,method,status,tokens_in,tokens_out")
    .eq("user_id", profile.id)
    .gte("ts", monthStartIso);

  if (monthErr) throw new Error(`usage quota query failed: ${monthErr.message}`);

  let disputes_used = 0;
  let tokens_used = 0;
  for (const m of monthRows ?? []) {
    if (
      m.endpoint === "/api/disputes" &&
      m.method === "POST" &&
      (m.status as number) < 400
    ) {
      disputes_used += 1;
    }
    tokens_used += (m.tokens_in as number) + (m.tokens_out as number);
  }

  return {
    window_start: windowStartIso,
    window_end: now.toISOString(),
    totals: {
      requests,
      disputes_opened,
      messages_sent,
      tokens_in,
      tokens_out,
      cost_usd: Math.round(cost_usd * 1_000_000) / 1_000_000,
    },
    by_endpoint: [...byEndpoint.entries()]
      .map(([endpoint, v]) => ({ endpoint, ...v }))
      .sort((a, b) => b.requests - a.requests),
    quota: {
      disputes_used,
      disputes_limit: profile.monthly_quota_disputes,
      tokens_used,
      tokens_limit: profile.monthly_quota_tokens,
    },
    recent: events.slice(0, 20),
  };
}

export async function checkQuotaOk(profile: Profile): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!profile.allowed) {
    return {
      ok: false,
      reason:
        "Account is not on the Pacta allowlist. Ask an admin to set profiles.allowed = true for this user.",
    };
  }

  const admin = getSupabaseAdmin();
  const monthStartIso = monthStart().toISOString();

  const { data: rows, error } = await admin
    .from("usage_events")
    .select("endpoint,method,status,tokens_in,tokens_out")
    .eq("user_id", profile.id)
    .gte("ts", monthStartIso);

  if (error) {
    console.error("[pacta-usage] checkQuotaOk query failed:", error.message);
    return { ok: true };
  }

  let disputes_used = 0;
  let tokens_used = 0;
  for (const m of rows ?? []) {
    if (
      m.endpoint === "/api/disputes" &&
      m.method === "POST" &&
      (m.status as number) < 400
    ) {
      disputes_used += 1;
    }
    tokens_used += (m.tokens_in as number) + (m.tokens_out as number);
  }

  if (disputes_used >= profile.monthly_quota_disputes) {
    return {
      ok: false,
      reason: `Monthly dispute quota exhausted (${disputes_used}/${profile.monthly_quota_disputes}).`,
    };
  }
  if (tokens_used >= profile.monthly_quota_tokens) {
    return {
      ok: false,
      reason: `Monthly token quota exhausted (${tokens_used}/${profile.monthly_quota_tokens}).`,
    };
  }

  return { ok: true };
}
