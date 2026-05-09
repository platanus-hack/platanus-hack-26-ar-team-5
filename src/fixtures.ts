import { signDoc, docHash } from "./sign.js";
import type { AgentBook } from "./agents.js";
import type { Evidence, SignedEvidence } from "./types.js";
import type { Scenario } from "./scenarios/types.js";

export type EvidencePool = {
  signed: SignedEvidence[];
  byEvidenceId: Map<string, SignedEvidence>;
  byHash: Map<string, SignedEvidence>;
};

/** Sign every EvidenceSeed in the scenario with the matching agent's key and
 *  index by evidence_id and content hash. Pure function over scenario+agents. */
export function buildEvidencePool(agents: AgentBook, scenario: Scenario): EvidencePool {
  const signed: SignedEvidence[] = [];
  const byEvidenceId = new Map<string, SignedEvidence>();
  const byHash = new Map<string, SignedEvidence>();
  const now = new Date().toISOString();

  for (const seed of scenario.evidence) {
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
