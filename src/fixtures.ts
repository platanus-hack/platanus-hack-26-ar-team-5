import { signDoc, docHash } from "./sign.js";
import type { AgentBook } from "./agents.js";
import type { Evidence, EvidenceTier, SignedEvidence } from "./types.js";

type EvidenceSeed = {
  evidence_id: string;
  submitter: keyof AgentBook;
  tier: EvidenceTier;
  title: string;
  body: string;
};

const SEEDS: EvidenceSeed[] = [
  // Pro-Aria (customer)
  {
    evidence_id: "msa-3.4",
    submitter: "aria",
    tier: "S",
    title: "MSA §3.4 — Committed-Spend Amendment",
    body:
      "Master Services Agreement Section 3.4 (signed at last renewal): Customer commits USD 1,200,000 over 12 months in exchange for guaranteed list-price discount; overage charged at on-demand rate. Both Customer and Provider counter-signed.",
  },
  {
    evidence_id: "bench-lm-eval",
    submitter: "aria",
    tier: "A",
    title: "Internal lm-eval-harness benchmark",
    body:
      "Run on AgentBench v2 (public, reproducible) against model X.Y → X.Z. pass@1 dropped from 71.4% to 65.7% (-5.7pp absolute, -8% relative) on the customer's primary agent task. Benchmark code and seeds publicly hosted; results checksum sha256:8a92d6.",
  },
  {
    evidence_id: "api-logs-retry",
    submitter: "aria",
    tier: "S",
    title: "Provider-signed API logs (period 2026-04-01 → 2026-04-30)",
    body:
      "Logs delivered via Provider's audit-export endpoint, signed with Provider's audit key. Retry rate on customer's account: 9.1% baseline (Mar) → 12.7% (Apr, post-rollout). +40% relative increase. Token volume: 1.4× expected. No client-side code changes in repo during window.",
  },
  {
    evidence_id: "changelog-x.z",
    submitter: "aria",
    tier: "A",
    title: "Public changelog entry for model X.Z",
    body:
      "Provider's public changelog, dated 2026-03-18: 'Model X.Z rolled out. Minor performance optimizations. No expected behavioral change for customers on default settings.' Hash of the changelog page at the time of update: sha256:dd14e2.",
  },
  // Pro-Atlas (provider)
  {
    evidence_id: "tos-8.2",
    submitter: "atlas",
    tier: "S",
    title: "Terms of Service §8.2 — Minor Version Bumps",
    body:
      "ToS Section 8.2: 'Provider may roll out minor model version updates (X.Y → X.Z) with at least 14 days' notice via the public changelog. Customers concerned with specific version pinning should opt in to the version-pinning add-on.' Acknowledged at sign-up.",
  },
  {
    evidence_id: "policy-um-v3.2026",
    submitter: "atlas",
    tier: "B",
    title: "Internal Utilization Management Policy v3.2026",
    body:
      "Provider-internal policy: claims for quality regression require an A/B test against a Provider-audited dataset before any goodwill credit can be considered. This is auto-emitted by Atlas's principal; not externally verifiable.",
  },
  {
    evidence_id: "support-tickets",
    submitter: "atlas",
    tier: "S",
    title: "Support records (period 2026-04-01 → 2026-04-30)",
    body:
      "Provider-signed extract of the support system: zero tickets opened by Customer's account during the disputed period. First contact regarding overage was the formal claim notice on 2026-05-03.",
  },
  {
    evidence_id: "sla-public",
    submitter: "atlas",
    tier: "S",
    title: "Public SLA — uptime + p99 latency",
    body:
      "Provider's published SLA covers monthly uptime (≥99.9%) and p99 latency (≤2.5s) per region. It does not enumerate output-quality guarantees. Customer's account met both targets in the disputed window.",
  },
  {
    evidence_id: "eval-api-release",
    submitter: "atlas",
    tier: "A",
    title: "Eval API release notes (2026-03-12)",
    body:
      "Provider's release note for the new Eval API (published 30 days before the disputed period): customers can subscribe to per-version regression alerts. Opt-in. Public docs hash sha256:b7a401.",
  },
];

export type EvidencePool = {
  signed: SignedEvidence[];
  byEvidenceId: Map<string, SignedEvidence>;
  byHash: Map<string, SignedEvidence>;
};

export function buildEvidencePool(agents: AgentBook): EvidencePool {
  const signed: SignedEvidence[] = [];
  const byEvidenceId = new Map<string, SignedEvidence>();
  const byHash = new Map<string, SignedEvidence>();
  const now = new Date().toISOString();

  for (const seed of SEEDS) {
    const submitter = agents[seed.submitter];
    const evidence: Evidence = {
      type: "Evidence",
      evidence_id: seed.evidence_id,
      submitter: submitter.did,
      tier: seed.tier,
      title: seed.title,
      body: seed.body,
      produced_at: now,
    };
    const signedEvidence = signDoc(evidence, submitter.keypair, submitter.did);
    const h = docHash(signedEvidence);
    signed.push(signedEvidence);
    byEvidenceId.set(seed.evidence_id, signedEvidence);
    byHash.set(h, signedEvidence);
  }
  return { signed, byEvidenceId, byHash };
}

export const EVIDENCE_SEEDS = SEEDS;
