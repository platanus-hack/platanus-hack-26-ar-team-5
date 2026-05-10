import { signDoc, docHash } from "./sign";
import type { AgentBook } from "./agents";
import type { Evidence, SignedEvidence } from "./types";
import type { Scenario } from "./scenarios/types";

export type EvidencePool = {
  signed: SignedEvidence[];
  byEvidenceId: Map<string, SignedEvidence>;
  byHash: Map<string, SignedEvidence>;
};

/** Sign every EvidenceSeed in the scenario with the matching agent's key and
 *  index by evidence_id and content hash. Pure function over scenario+agents.
 *  When `at` is provided (typically the dispute's created_at), the evidence
 *  signing is deterministic across reloads — same canonical bytes, same hashes. */
export function buildEvidencePool(
  agents: AgentBook,
  scenario: Scenario,
  at?: string,
): EvidencePool {
  const signed: SignedEvidence[] = [];
  const byEvidenceId = new Map<string, SignedEvidence>();
  const byHash = new Map<string, SignedEvidence>();
  const ts = at ?? new Date().toISOString();

  for (const seed of scenario.evidence) {
    const submitter = agents[seed.submitter];
    const evidence: Evidence = {
      type: "Evidence",
      evidence_id: seed.evidence_id,
      submitter: submitter.did,
      tier: seed.tier,
      title: seed.title,
      body: seed.body,
      produced_at: ts,
    };
    const signedEvidence = signDoc(evidence, submitter.keypair, submitter.did, ts);
    const h = docHash(signedEvidence);
    signed.push(signedEvidence);
    byEvidenceId.set(seed.evidence_id, signedEvidence);
    byHash.set(h, signedEvidence);
  }
  return { signed, byEvidenceId, byHash };
}
