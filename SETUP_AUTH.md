# Setting up Pacta auth (Google OAuth + per-user API keys + usage)

The `feat/auth-supabase-google` branch adds:

- Google sign-in via Supabase Auth
- Per-user API keys (X-Pacta-Key) gating `/api/mcp` and `/api/disputes/*`
- Per-user usage tracking (requests, disputes, tokens, USD cost) on `/dashboard/usage`
- An allowlist (`profiles.allowed`) so credits don't get drained by random sign-ins

## 1 — Create a Supabase project

1. Go to <https://supabase.com> → new project. Pick the closest region.
2. Wait for provisioning, then grab from **Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never exposed)

## 2 — Run the schema migration

In the Supabase project, open **SQL editor** → New query → paste the contents of
[`migrations/0001_auth_init.sql`](./migrations/0001_auth_init.sql) → Run.

The migration is idempotent and creates:

- `profiles` (1:1 with `auth.users`, holds `allowed` flag and quotas)
- `api_keys` (sha256 hash only — plaintext is shown to the user once)
- `usage_events` (append-only ledger)
- RLS policies so each user only reads their own rows
- A trigger that auto-creates a `profiles` row on every new sign-up

## 3 — Enable Google as an OAuth provider

In Supabase: **Authentication → Providers → Google** → Enable.

You need a Google OAuth Client. In Google Cloud Console:

1. APIs & Services → Credentials → **Create credentials → OAuth Client ID**
2. App type: Web application
3. Authorized redirect URIs:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
   (Supabase shows you this exact URL in the provider config — copy from there.)

Paste the resulting client id + secret into the Supabase Google provider config and save.

## 4 — Configure your local `.env.local`

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...

NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PACTA_PUBLIC_BASE_URL=http://localhost:3000

# Comma-separated emails that get profile.allowed=true on first sign-in.
# Anyone not on the list lands on /dashboard with an "awaiting allowlist" notice.
ALLOWED_EMAILS=you@example.com,teammate@example.com
```

Then in Supabase **Authentication → URL configuration**, add to Redirect URLs:

```
http://localhost:3000/auth/callback
https://<your-prod-domain>/auth/callback
```

## 5 — Test the flow

```bash
pnpm install
pnpm dev
```

1. Visit <http://localhost:3000/login> → "Continue with Google" → grant.
2. You land on `/dashboard`. If your email is on `ALLOWED_EMAILS`, the
   allowlist banner is gone.
3. `/dashboard/settings` → mint an API key. Copy it once — it's gone after.
4. Test the gate:
   ```bash
   curl http://localhost:3000/api/scenarios -H "X-Pacta-Key: pacta_live_..."
   # → 200 with the scenario list

   curl http://localhost:3000/api/scenarios
   # → 401, asks you to sign in or send the key
   ```
5. `/dashboard/usage` shows the request you just made.

## 6 — Promoting users in production

The simplest path: keep `ALLOWED_EMAILS` short during the demo. For one-off
promotions, run this in the Supabase SQL editor:

```sql
update public.profiles
set allowed = true,
    monthly_quota_disputes = 200,
    monthly_quota_tokens = 5000000
where email = 'someone@example.com';
```

## Where things live

- `lib/auth/supabase-server.ts` · server-side client + `requireUser()`
- `lib/auth/supabase-browser.ts` · client-side client (only the anon key)
- `lib/auth/supabase-admin.ts` · service-role client (server-only writes)
- `lib/auth/api-auth.ts` · `withApiAuthAppRouter` / `withApiAuthPagesRouter`
- `lib/auth/usage.ts` · `recordUsage`, `getUserUsageSummary`, `checkQuotaOk`
- `lib/auth/pricing.ts` · Anthropic price book → USD
- `app/auth/callback/route.ts` · Supabase OAuth callback handler
- `app/auth/signout/route.ts` · POST → clear session
- `app/login/page.tsx` · single-CTA Google sign-in
- `app/dashboard/{settings,usage}/page.tsx` · the new dashboard sections
- `app/api/keys/*` and `app/api/usage/route.ts` · dashboard-facing JSON endpoints
- `migrations/0001_auth_init.sql` · the Postgres schema
