/**
 * Auth gate for Pacta's external API surface (MCP + REST).
 *
 * Two ways to authenticate:
 *   1. X-Pacta-Key (or Authorization: Bearer …) — required for external
 *      consumers like MCP clients and third-party agents.
 *   2. Supabase session cookie — used by the dashboard itself when calling
 *      its own REST routes. Opt-in per-route via `{ allowSession: true }`.
 *
 * Two router shapes because the codebase mixes them:
 *   - withApiAuthAppRouter: Request → Response (used by app/api/*)
 *   - withApiAuthPagesRouter: NextApiRequest → NextApiResponse (used by pages/api/*)
 *
 * Both wrappers do the same work:
 *   1. Resolve { profile, api_key | null } from key or cookie.
 *   2. Refuse if profile.allowed = false.
 *   3. Quota check.
 *   4. Run the handler inside an AsyncLocalStorage scope so claude_driver
 *      can attribute token spend back to the user.
 *   5. Record one usage_event with status + dispute_id (if known).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import type { IncomingMessage } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "./supabase-admin";
import {
  getCurrentUser,
  getCurrentUserFromRequest,
  type CurrentUser,
} from "./supabase-server";
import { checkQuotaOk, recordUsage, runWithAttribution } from "./usage";
import type { ApiKey, Profile } from "./types";

const API_KEY_PREFIX = "pacta_live_";

export function generateApiKey(): {
  plaintext: string;
  hash: string;
  prefix: string;
} {
  const random = randomBytes(24).toString("hex");
  const plaintext = `${API_KEY_PREFIX}${random}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, 12),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export type AuthenticatedContext = {
  profile: Profile;
  /** Null when the request was authenticated via session cookie. */
  api_key: ApiKey | null;
  /** "key" or "session" — useful for routes that want to reject one or the other. */
  via: "key" | "session";
};

type AuthError = { status: number; body: { error: string } };

function extractKey(headerVal: string | null | undefined): string | null {
  if (!headerVal) return null;
  const trimmed = headerVal.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim() || null;
  }
  return trimmed;
}

async function authenticateKey(plaintext: string): Promise<
  { ok: true; ctx: AuthenticatedContext } | { ok: false; err: AuthError }
> {
  const admin = getSupabaseAdmin();
  const hash = hashApiKey(plaintext);

  const { data: key, error } = await admin
    .from("api_keys")
    .select("*")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !key) {
    return {
      ok: false,
      err: { status: 401, body: { error: "Invalid or revoked Pacta API key." } },
    };
  }

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("*")
    .eq("id", key.user_id)
    .maybeSingle();

  if (profileErr || !profile) {
    return {
      ok: false,
      err: { status: 401, body: { error: "API key owner not found." } },
    };
  }

  const quota = await checkQuotaOk(profile as Profile);
  if (!quota.ok) {
    return {
      ok: false,
      err: { status: 429, body: { error: quota.reason ?? "Quota exhausted." } },
    };
  }

  // Best-effort: bump last_used_at.
  void admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id)
    .then(({ error: e }) => {
      if (e)
        console.error("[pacta-auth] last_used_at update failed:", e.message);
    });

  return {
    ok: true,
    ctx: { profile: profile as Profile, api_key: key as ApiKey, via: "key" },
  };
}

async function authenticateSession(
  loadUser: () => Promise<CurrentUser | null>,
): Promise<
  { ok: true; ctx: AuthenticatedContext } | { ok: false; err: AuthError } | null
> {
  const me = await loadUser();
  if (!me) return null;

  const quota = await checkQuotaOk(me.profile);
  if (!quota.ok) {
    return {
      ok: false,
      err: { status: 429, body: { error: quota.reason ?? "Quota exhausted." } },
    };
  }

  return {
    ok: true,
    ctx: { profile: me.profile, api_key: null, via: "session" },
  };
}

type Authenticate = (args: {
  headerKey: string | null;
  allowSession: boolean;
  loadUser: () => Promise<CurrentUser | null>;
}) => Promise<{ ok: true; ctx: AuthenticatedContext } | { ok: false; err: AuthError }>;

const authenticate: Authenticate = async ({
  headerKey,
  allowSession,
  loadUser,
}) => {
  const plaintext = extractKey(headerKey);
  if (plaintext) {
    return authenticateKey(plaintext);
  }

  if (allowSession) {
    const sessionResult = await authenticateSession(loadUser);
    if (sessionResult && "ok" in sessionResult) return sessionResult;
  }

  return {
    ok: false,
    err: {
      status: 401,
      body: {
        error: allowSession
          ? "Sign in or send X-Pacta-Key. Mint a key in /dashboard/settings."
          : "Missing X-Pacta-Key (or Authorization: Bearer …). Mint one in /dashboard/settings.",
      },
    },
  };
};

// ---------------------------------------------------------------------------
// App Router wrapper
// ---------------------------------------------------------------------------

type AppHandler<P = unknown> = (
  req: Request,
  ctx: { params: Promise<P>; auth: AuthenticatedContext },
) => Promise<Response> | Response;

export function withApiAuthAppRouter<P = unknown>(
  handler: AppHandler<P>,
  opts: { allowSession?: boolean } = {},
) {
  const allowSession = opts.allowSession ?? false;

  return async (
    req: Request,
    ctx: { params: Promise<P> },
  ): Promise<Response> => {
    const url = new URL(req.url);
    const endpoint = url.pathname;
    const method = req.method.toUpperCase();

    const headerKey =
      req.headers.get("x-pacta-key") ?? req.headers.get("authorization");

    const result = await authenticate({
      headerKey,
      allowSession,
      loadUser: getCurrentUser,
    });
    if (!result.ok) {
      return Response.json(result.err.body, { status: result.err.status });
    }

    const { profile, api_key } = result.ctx;
    let response: Response;
    let disputeId: string | null = null;

    try {
      response = await runWithAttribution(
        {
          user_id: profile.id,
          api_key_id: api_key?.id ?? null,
          endpoint,
          method,
        },
        () =>
          Promise.resolve(handler(req, { params: ctx.params, auth: result.ctx })),
      );
      disputeId = response.headers.get("X-Pacta-Dispute-Id");
    } catch (err) {
      await recordUsage({
        user_id: profile.id,
        api_key_id: api_key?.id ?? null,
        endpoint,
        method,
        status: 500,
      });
      throw err;
    }

    await recordUsage({
      user_id: profile.id,
      api_key_id: api_key?.id ?? null,
      endpoint,
      method,
      status: response.status,
      dispute_id: disputeId,
    });

    return response;
  };
}

// ---------------------------------------------------------------------------
// Pages Router wrapper
// ---------------------------------------------------------------------------

type PagesHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  auth: AuthenticatedContext,
) => Promise<void> | void;

export function withApiAuthPagesRouter(
  handler: PagesHandler,
  opts: { allowSession?: boolean } = {},
) {
  const allowSession = opts.allowSession ?? false;

  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Pacta-Key, Mcp-Session-Id, Mcp-Protocol-Version",
      );
      res.status(204).end();
      return;
    }

    const endpoint = (req.url ?? "/").split("?")[0]!;
    const method = (req.method ?? "GET").toUpperCase();

    const headerKey =
      (req.headers["x-pacta-key"] as string | undefined) ??
      (req.headers["authorization"] as string | undefined) ??
      null;

    const result = await authenticate({
      headerKey: headerKey ?? null,
      allowSession,
      loadUser: () => getCurrentUserFromRequest(req as IncomingMessage),
    });
    if (!result.ok) {
      res.status(result.err.status).json(result.err.body);
      return;
    }

    const { profile, api_key } = result.ctx;

    let recorded = false;
    const recordOnce = async (status: number) => {
      if (recorded) return;
      recorded = true;
      await recordUsage({
        user_id: profile.id,
        api_key_id: api_key?.id ?? null,
        endpoint,
        method,
        status,
      });
    };

    res.on("close", () => {
      void recordOnce(res.statusCode || 200);
    });

    try {
      await runWithAttribution(
        {
          user_id: profile.id,
          api_key_id: api_key?.id ?? null,
          endpoint,
          method,
        },
        async () => {
          await handler(req, res, result.ctx);
        },
      );
    } catch (err) {
      await recordOnce(500);
      throw err;
    }
  };
}
