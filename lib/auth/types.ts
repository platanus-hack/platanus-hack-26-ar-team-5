/**
 * Shared types for Pacta auth + usage tracking.
 *
 * The Postgres schema lives in migrations/0001_auth_init.sql — keep these
 * shapes in sync if you add columns there.
 */

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  allowed: boolean;
  monthly_quota_disputes: number;
  monthly_quota_tokens: number;
  created_at: string;
};

export type ApiKey = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  key_hash: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type ApiKeyPublic = Omit<ApiKey, "key_hash"> & {
  /** Plaintext, only present on the response of POST /api/keys. */
  plaintext?: string;
};

export type UsageEvent = {
  id: number;
  user_id: string;
  api_key_id: string | null;
  endpoint: string;
  method: string;
  status: number;
  dispute_id: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  ts: string;
};

export type UsageSummary = {
  window_start: string;
  window_end: string;
  totals: {
    requests: number;
    disputes_opened: number;
    messages_sent: number;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
  };
  by_endpoint: Array<{
    endpoint: string;
    requests: number;
    last_used_at: string | null;
  }>;
  quota: {
    disputes_used: number;
    disputes_limit: number;
    tokens_used: number;
    tokens_limit: number;
  };
  recent: UsageEvent[];
};
