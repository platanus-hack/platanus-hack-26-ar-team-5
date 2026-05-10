# Setting up Pacta auth (email/password + per-user API keys + usage)

What this gives you:

- Email/password sign-up and sign-in via Supabase Auth
- Per-user API keys (`X-Pacta-Key`) gating `/api/mcp` and `/api/disputes/*`
- Per-user usage tracking (requests, disputes, tokens, USD cost) on `/dashboard/usage`
- An allowlist (`profiles.allowed`) so credits don't get drained by random sign-ups
- An admin tier with bumped quotas, also flipped from env

## 1 — Create a Supabase project

1. Go to <https://supabase.com> → new project. Pick the closest region.
2. Wait for provisioning, then grab from **Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never exposed)

## 2 — Run the schema migration

Open the Supabase **SQL editor** → New query → paste the contents of
[`migrations/0001_auth_init.sql`](./migrations/0001_auth_init.sql) → Run.

The migration is idempotent and creates:

- `profiles` (1:1 with `auth.users`, holds `allowed` flag and quotas)
- `api_keys` (sha256 hash only — plaintext is shown to the user once)
- `usage_events` (append-only ledger)
- RLS policies so each user only reads their own rows
- A trigger that auto-creates a `profiles` row on every new sign-up

The repo doesn't ship a `supabase/` CLI workspace, so the SQL editor is the
intended path. If you prefer `psql`, run the file against the project's
`DATABASE_URL` from **Settings → Database → Connection string**.

## 3 — Configure Supabase Auth

In the Supabase dashboard:

1. **Authentication → Providers → Email** → make sure it's enabled. That's the
   only provider Pacta uses; no Google, no magic links.
2. **Authentication → Providers → Email → Confirm email** → turn this **off**
   for the hackathon demo. With confirmation on, sign-up returns no session
   and the user has to click an email link before they can do anything; the
   demo flow is tested with confirmation disabled.
3. **Authentication → URL configuration → Redirect URLs** → add:

   ```
   http://localhost:3000/auth/callback
   https://<your-prod-domain>/auth/callback
   ```

   The `/auth/callback` route is only used for password-reset and confirmation
   email flows (PKCE). Email/password sign-in itself never round-trips through
   it — it's handled by the server actions in `app/login/actions.ts`.

## 4 — Configure your local `.env.local`

Copy `.env.example` and fill in the Supabase values:

```bash
ANTHROPIC_API_KEY=sk-ant-...

NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PACTA_PUBLIC_BASE_URL=http://localhost:3000

ALLOWED_EMAILS=teammate@example.com
ADMIN_EMAILS=you@example.com
```

`ALLOWED_EMAILS` flips `profiles.allowed=true` on first sign-in. `ADMIN_EMAILS`
does the same and bumps `monthly_quota_disputes` to 500 and
`monthly_quota_tokens` to 10M. `ADMIN_EMAILS` is a strict superset — an email
listed there does not also need to be in `ALLOWED_EMAILS`. Both lists are
comma-separated and case-insensitive.

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are optional. Without
them the dispute engine falls back to in-process memory, which is fine for
local dev but loses state across restarts.

## 5 — Run it locally

```bash
pnpm install
pnpm dev
```

1. Visit <http://localhost:3000/login>, click **Create one**, fill in email +
   password (8 chars min), submit. You land on `/dashboard`.
2. If your email is in `ADMIN_EMAILS` or `ALLOWED_EMAILS`, the "request
   access" notice is gone and you can mint API keys. Otherwise, ask whoever
   owns the env to add you, or promote yourself manually (see §8).
3. `/dashboard/settings` → **New API key** → name it, copy the plaintext
   shown once. The DB only stores the sha256 hash, so a lost key is gone.

## 6 — Hit the API with your key

The dispute API expects JSON. The minimum body is `{}` (the route fills in
`scenario_id="ai-overrun"`, `max_rounds=5`, `tribunal_mode="binding"`). The
response is NDJSON: one JSON object per line, terminated by `{"kind":"stream.end"}`.

```bash
curl -N http://localhost:3000/api/disputes \
  -H "X-Pacta-Key: pacta_live_..." \
  -H "Content-Type: application/json" \
  -d '{"scenario_id":"ai-overrun","max_rounds":3,"tribunal_mode":"binding"}'
```

The first line is always `{"kind":"dispute.created", "dispute_id":"...", ...}`,
which gives you the id to poll `GET /api/disputes/:id` from another shell.

To list scenarios and existing disputes:

```bash
curl http://localhost:3000/api/disputes -H "X-Pacta-Key: pacta_live_..."
```

To check your own usage:

```bash
curl http://localhost:3000/api/usage?windowDays=7 \
  -H "Cookie: <paste sb-... cookies from your browser>"
```

`/api/usage` is session-only (it's read by the dashboard); it does not accept
`X-Pacta-Key`.

## 7 — Quotas and usage tracking

Every gated request is wrapped by `withApiAuthAppRouter` (or the Pages Router
twin) in `lib/auth/api-auth.ts`. The wrapper:

1. Resolves the caller from `X-Pacta-Key` or, when `allowSession: true`, from
   the Supabase session cookie.
2. Runs `checkQuotaOk(profile)` from `lib/auth/usage.ts`. This sums the
   calendar-month rows in `usage_events` and refuses with HTTP 429 if either:
   - successful `POST /api/disputes` count ≥ `profiles.monthly_quota_disputes`
   - `tokens_in + tokens_out` sum ≥ `profiles.monthly_quota_tokens`
3. Records one `usage_events` row per request (status, dispute id, tokens,
   USD cost). Per-turn Claude token spend is attributed back via
   `runWithAttribution` + `recordClaudeTurn`.

Defaults from `migrations/0001_auth_init.sql`:
`monthly_quota_disputes=50`, `monthly_quota_tokens=1_000_000`.

## 8 — Promoting users by hand

For one-off promotions (someone signs up but isn't in the env lists), run
this in the Supabase SQL editor:

```sql
update public.profiles
set allowed = true,
    monthly_quota_disputes = 200,
    monthly_quota_tokens = 5000000
where email = 'someone@example.com';
```

To revoke an API key without dropping the row (so its `usage_events` keep
their FK):

```sql
update public.api_keys
set revoked_at = now()
where prefix = 'pacta_live_';
```

## Where things live

- `lib/auth/supabase-server.ts` — server client + `getCurrentUser` / `requireUser`
- `lib/auth/supabase-browser.ts` — browser client (anon key only)
- `lib/auth/supabase-admin.ts` — service-role client (server-only writes)
- `lib/auth/api-auth.ts` — `withApiAuthAppRouter` / `withApiAuthPagesRouter`, key gen + hashing
- `lib/auth/usage.ts` — `recordUsage`, `getUserUsageSummary`, `checkQuotaOk`, `runWithAttribution`
- `lib/auth/promote.ts` — env-driven `ALLOWED_EMAILS` / `ADMIN_EMAILS` promotion
- `lib/auth/pricing.ts` — Anthropic price book → USD
- `app/login/page.tsx` + `app/login/actions.ts` — email/password forms and server actions
- `app/auth/callback/route.ts` — PKCE callback (password reset, email confirm)
- `app/auth/signout/route.ts` — POST to clear the session
- `app/dashboard/settings/page.tsx`, `app/dashboard/usage/page.tsx` — dashboard sections
- `app/api/keys/route.ts`, `app/api/usage/route.ts` — dashboard-facing JSON
- `app/api/disputes/route.ts` — gated NDJSON stream
- `migrations/0001_auth_init.sql` — the Postgres schema
