/**
 * Pluggable storage for dispute state. Two backends:
 *
 * - MemoryStorage: globalThis-backed Map, fast but per-process (loses state on
 *   Vercel cold starts). Default when no Redis env is configured.
 * - RedisStorage: Upstash Redis over REST (works on any serverless platform,
 *   including Vercel free tier across cold starts and instances).
 *
 * Selected by environment: if either KV_REST_API_URL or UPSTASH_REDIS_REST_URL
 * (and matching token) is set, Redis is used. Otherwise memory.
 *
 * Pacta only stores PRIVATE-KEY HEX for each agent (32 bytes); public keys and
 * DIDs are re-derived on load. Scenario (huge) is never stored — only its id,
 * resolved from the in-process registry.
 */
import { Redis } from "@upstash/redis";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { deriveDid } from "./did";
import { buildEvidencePool, type EvidencePool } from "./fixtures";

void buildEvidencePool; // re-exported for callers; storage uses indexEvidence
import { docHash } from "./sign";
import { getScenario, type Scenario } from "./scenarios/index";
import type { AgentBook, AgentRole as IdentityRole } from "./agents";
import type {
  Bundle,
  SignedEvidence,
  SignedMessage,
  SignedRuling,
  SignedVote,
} from "./types";

ed.hashes.sha512 = sha512;

export type AgentRole = "aria" | "atlas";

export type StoredDispute = {
  dispute_id: string;
  /** Free-form description of the dispute supplied by the opener. The agents'
   *  positions, evidence and arguments come from them, not from us. */
  claim: string | null;
  /** Optional template id — only set when this dispute was opened from one of
   *  our bundled scenario templates. Schema-less disputes leave this null. */
  scenario_id: string | null;
  /** Signed evidence pool. Pre-loaded from a scenario template when scenario_id
   *  is set, OR appended by the parties via submit_evidence. Always stored
   *  directly so canonical bytes / hashes are stable across reloads. */
  signed_evidence: SignedEvidence[];
  history: SignedMessage[];
  controllers: Record<AgentRole, "external" | "claude">;
  role_tokens: Record<AgentRole, string>;
  claimed: Record<AgentRole, boolean>;
  turn: AgentRole;
  current_round: number;
  max_rounds: number;
  pending_feedback: string[];
  finalized: { bundle: Bundle } | null;
  ruling: { votes: SignedVote[]; ruling: SignedRuling } | null;
  created_at: string;
  /** Hex-encoded 32-byte Ed25519 private keys per role. Public keys + DIDs are
   *  re-derived from these on load — never stored. */
  agent_keys: { aria: string; atlas: string; tribunal: string };
};

/** Hydrated runtime view: the StoredDispute plus the reconstructed AgentBook,
 *  EvidencePool, and (optionally) Scenario reference. Created on each load. */
export type LiveDispute = StoredDispute & {
  /** Optional — only present for template-driven disputes. */
  scenario: Scenario | null;
  agents: AgentBook;
  evidence: EvidencePool;
};

export interface DisputeStorage {
  get(id: string): Promise<StoredDispute | null>;
  put(state: StoredDispute): Promise<void>;
  delete(id: string): Promise<void>;
  /** Return ids of disputes currently held in storage. Order is implementation-
   *  defined; callers that need recency must sort by `created_at` themselves. */
  list(): Promise<string[]>;
}

class MemoryStorage implements DisputeStorage {
  private map = new Map<string, StoredDispute>();
  async get(id: string) {
    return this.map.get(id) ?? null;
  }
  async put(state: StoredDispute) {
    this.map.set(state.dispute_id, state);
  }
  async delete(id: string) {
    this.map.delete(id);
  }
  async list() {
    return [...this.map.keys()];
  }
}

class RedisStorage implements DisputeStorage {
  constructor(private redis: Redis, private ttlSeconds = 60 * 60 * 6) {}
  private key(id: string) {
    return `pacta:dispute:${id}`;
  }
  private indexKey = "pacta:dispute_index";
  async get(id: string): Promise<StoredDispute | null> {
    const v = await this.redis.get(this.key(id));
    if (v === null || v === undefined) {
      // Drop stale entry from the index so list() stays accurate.
      await this.redis.srem(this.indexKey, id).catch(() => undefined);
      return null;
    }
    // Upstash auto-deserializes JSON; if it didn't, fall back to parse.
    if (typeof v === "string") {
      try {
        return JSON.parse(v) as StoredDispute;
      } catch {
        return null;
      }
    }
    return v as StoredDispute;
  }
  async put(state: StoredDispute) {
    await this.redis.set(this.key(state.dispute_id), JSON.stringify(state), {
      ex: this.ttlSeconds,
    });
    await this.redis.sadd(this.indexKey, state.dispute_id);
  }
  async delete(id: string) {
    await this.redis.del(this.key(id));
    await this.redis.srem(this.indexKey, id).catch(() => undefined);
  }
  async list(): Promise<string[]> {
    const ids = await this.redis.smembers(this.indexKey);
    return Array.isArray(ids) ? ids.map(String) : [];
  }
}

let _storage: DisputeStorage | null = null;
export function getStorage(): DisputeStorage {
  if (_storage) return _storage;
  // Vercel KV exposes KV_REST_API_URL+KV_REST_API_TOKEN.
  // Manual Upstash exposes UPSTASH_REDIS_REST_URL+UPSTASH_REDIS_REST_TOKEN.
  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    _storage = new RedisStorage(new Redis({ url, token }));
  } else {
    _storage = new MemoryStorage();
  }
  return _storage;
}

export function isPersistent(): boolean {
  return getStorage() instanceof RedisStorage;
}

/** Generate a fresh AgentBook (3 keypairs) and return both the live AgentBook
 *  and the hex private keys to persist. */
export function freshAgents(): {
  agents: AgentBook;
  agent_keys: { aria: string; atlas: string; tribunal: string };
} {
  const roles: IdentityRole[] = ["aria", "atlas", "tribunal"];
  const friendlyNames: Record<IdentityRole, string> = {
    aria: "Aria",
    atlas: "Atlas",
    tribunal: "Tribunal",
  };
  const agents = {} as AgentBook;
  const keys = {} as Record<IdentityRole, string>;
  for (const role of roles) {
    const privateKey = ed.utils.randomSecretKey();
    const publicKey = ed.getPublicKey(privateKey);
    const did = deriveDid(publicKey);
    agents[role] = {
      role,
      name: friendlyNames[role],
      did,
      keypair: { privateKey, publicKey },
    };
    keys[role] = bytesToHex(privateKey);
  }
  return { agents, agent_keys: keys };
}

/** Rehydrate an AgentBook from stored hex private keys. */
export function rehydrateAgents(stored: StoredDispute["agent_keys"]): AgentBook {
  const friendlyNames: Record<IdentityRole, string> = {
    aria: "Aria",
    atlas: "Atlas",
    tribunal: "Tribunal",
  };
  const agents = {} as AgentBook;
  for (const role of ["aria", "atlas", "tribunal"] as IdentityRole[]) {
    const privateKey = hexToBytes(stored[role]);
    const publicKey = ed.getPublicKey(privateKey);
    const did = deriveDid(publicKey);
    agents[role] = {
      role,
      name: friendlyNames[role],
      did,
      keypair: { privateKey, publicKey },
    };
  }
  return agents;
}

function indexEvidence(signed: SignedEvidence[]): EvidencePool {
  const byEvidenceId = new Map<string, SignedEvidence>();
  const byHash = new Map<string, SignedEvidence>();
  for (const e of signed) {
    byEvidenceId.set(e.evidence_id, e);
    byHash.set(docHash(e), e);
  }
  return { signed, byEvidenceId, byHash };
}

/** Load a full LiveDispute from storage: rehydrates agents and indexes the
 *  signed evidence pool. Signed evidence bytes are stored directly so canonical
 *  hashes are stable without rebuilding. */
export async function loadDispute(dispute_id: string): Promise<LiveDispute | null> {
  const stored = await getStorage().get(dispute_id);
  if (!stored) return null;
  const scenario = stored.scenario_id ? getScenario(stored.scenario_id) : null;
  const agents = rehydrateAgents(stored.agent_keys);
  const evidence = indexEvidence(stored.signed_evidence ?? []);
  return { ...stored, scenario, agents, evidence };
}

/** Return a list of dispute ids currently held in storage. */
export async function listDisputeIds(): Promise<string[]> {
  return getStorage().list();
}

/** Convenience: load every dispute the storage knows about. Skips ids whose
 *  payload has expired between list() and get(). */
export async function listDisputes(): Promise<LiveDispute[]> {
  const ids = await listDisputeIds();
  const out: LiveDispute[] = [];
  for (const id of ids) {
    const live = await loadDispute(id);
    if (live) out.push(live);
  }
  return out;
}

/** Delete a dispute payload + index entry. */
export async function deleteDispute(dispute_id: string): Promise<void> {
  await getStorage().delete(dispute_id);
}

/** Save a LiveDispute back to storage. The scenario/agents reconstructions are
 *  NOT persisted — they're recomputed on next load. signed_evidence IS stored. */
export async function saveDispute(live: LiveDispute): Promise<void> {
  const stored: StoredDispute = {
    dispute_id: live.dispute_id,
    claim: live.claim,
    scenario_id: live.scenario_id,
    signed_evidence: live.evidence.signed,
    history: live.history,
    controllers: live.controllers,
    role_tokens: live.role_tokens,
    claimed: live.claimed,
    turn: live.turn,
    current_round: live.current_round,
    max_rounds: live.max_rounds,
    pending_feedback: live.pending_feedback,
    finalized: live.finalized,
    ruling: live.ruling,
    created_at: live.created_at,
    agent_keys: live.agent_keys,
  };
  await getStorage().put(stored);
}
