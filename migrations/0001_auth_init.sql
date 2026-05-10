-- Pacta auth + per-user usage schema.
--
-- Run once in the Supabase SQL editor for the project (or via psql against the
-- DATABASE_URL). Idempotent: safe to re-run; uses IF NOT EXISTS / OR REPLACE.
--
-- Layout:
--   profiles      — 1:1 with auth.users, holds allowlist flag and quotas
--   api_keys      — per-user API keys (only sha256 hash stored)
--   usage_events  — append-only ledger of every gated request

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  allowed boolean not null default false,
  monthly_quota_disputes integer not null default 50,
  monthly_quota_tokens bigint not null default 1000000,
  created_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

-- ---------------------------------------------------------------------------
-- api_keys (hash-only; the plaintext is shown to the user once at creation)
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  prefix text not null,            -- first 12 chars of plaintext, for display
  key_hash text not null unique,   -- sha256 hex of plaintext
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_keys_user_idx on public.api_keys (user_id, created_at desc);
create index if not exists api_keys_active_idx on public.api_keys (user_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- usage_events (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.usage_events (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  endpoint text not null,
  method text not null,
  status integer not null,
  dispute_id text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  ts timestamptz not null default now()
);

create index if not exists usage_user_ts_idx on public.usage_events (user_id, ts desc);
create index if not exists usage_user_endpoint_idx on public.usage_events (user_id, endpoint, ts desc);

-- ---------------------------------------------------------------------------
-- RLS — every user only sees their own rows; writes for usage_events go
-- through the service role from the server, which bypasses RLS by design.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.api_keys enable row level security;
alter table public.usage_events enable row level security;

-- profiles: read/update self
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id);

-- api_keys: full self access
drop policy if exists "api_keys self read" on public.api_keys;
create policy "api_keys self read" on public.api_keys
  for select using (auth.uid() = user_id);

drop policy if exists "api_keys self insert" on public.api_keys;
create policy "api_keys self insert" on public.api_keys
  for insert with check (auth.uid() = user_id);

drop policy if exists "api_keys self update" on public.api_keys;
create policy "api_keys self update" on public.api_keys
  for update using (auth.uid() = user_id);

drop policy if exists "api_keys self delete" on public.api_keys;
create policy "api_keys self delete" on public.api_keys
  for delete using (auth.uid() = user_id);

-- usage_events: read self only; inserts come from the service role
drop policy if exists "usage_events self read" on public.usage_events;
create policy "usage_events self read" on public.usage_events
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Trigger: create a profile row whenever a new auth.users row appears.
-- The server-side allowlist check (ALLOWED_EMAILS) flips `allowed` to true
-- in the OAuth callback handler — we don't do it here so the SQL stays
-- environment-agnostic.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
