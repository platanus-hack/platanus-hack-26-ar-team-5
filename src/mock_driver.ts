/**
 * Deterministic mock LLM driver for testing and offline demos.
 * Walks through the canonical AI-overrun scenario without any network calls.
 */

import type { LLMDriver, MessageBody } from "./orchestrator.js";
import type { SignedMessage } from "./types.js";
import { docHash } from "./sign.js";

export type MockDriverOpts = {
  ariaDid: string;
  atlasDid: string;
  ariaEvidenceHashes: string[];
  atlasEvidenceHashes: string[];
};

export function makeMockDriver(opts: MockDriverOpts): LLMDriver {
  const { ariaDid, atlasDid, ariaEvidenceHashes, atlasEvidenceHashes } = opts;

  type StepFn = (h: SignedMessage[]) => MessageBody;

  const findOwnLastProposal = (h: SignedMessage[], did: string): SignedMessage | undefined => {
    for (let i = h.length - 1; i >= 0; i--) {
      const m = h[i]!;
      if (m.from_agent === did && (m.type === "Propose" || m.type === "CounterPropose")) return m;
    }
    return undefined;
  };

  const lastOpponentProposal = (h: SignedMessage[], me: string): SignedMessage | undefined => {
    for (let i = h.length - 1; i >= 0; i--) {
      const m = h[i]!;
      if (m.from_agent !== me && (m.type === "Propose" || m.type === "CounterPropose")) return m;
    }
    return undefined;
  };

  const script: StepFn[] = [
    // R1
    () => ({
      type: "Propose",
      round: 1,
      from_agent: ariaDid,
      evidence_refs: ariaEvidenceHashes,
      parent_refs: [],
      payload: {
        state: { credit_usd: 180000, terms: "full overage refund" },
        rationale:
          "MSA §3.4 caps committed-spend; provider-signed logs show +40% retry rate after the X.Z rollout. We claim the full $180k overage.",
        utility_for_self: 0.95,
      },
    }),
    (h) => {
      const ariaR1 = h[h.length - 1]!;
      return {
        type: "CounterPropose",
        round: 1,
        from_agent: atlasDid,
        evidence_refs: atlasEvidenceHashes,
        parent_refs: [docHash(ariaR1)],
        payload: {
          state: { credit_usd: 0, terms: "case closed per ToS §8.2 + no support tickets filed" },
          rationale:
            "ToS §8.2 grants 14d notice on minor model bumps (granted). Public SLA covers latency, not output quality. Customer filed zero support tickets in the disputed window.",
          utility_for_self: 0.92,
        },
      };
    },
    // R2: Aria reveals automatic-retry policy + Atlas reveals release-timing
    () => ({
      type: "Reveal",
      round: 2,
      from_agent: ariaDid,
      evidence_refs: [],
      parent_refs: [],
      payload: {
        domain: "retry-policy",
        information:
          "Our SDK retry policy is automatic with exponential backoff — that is why no human filed a ticket. The retries are themselves the symptom of regression.",
      },
    }),
    () => ({
      type: "Reveal",
      round: 2,
      from_agent: atlasDid,
      evidence_refs: [],
      parent_refs: [],
      payload: {
        domain: "release-timing",
        information:
          "Our regression-alerts Eval API was released 30 days before this dispute. Customers on it would have caught X.Z's behavior shift in their staging window.",
      },
    }),
    // R3: both move toward middle
    () => ({
      type: "CounterPropose",
      round: 3,
      from_agent: ariaDid,
      evidence_refs: ariaEvidenceHashes,
      parent_refs: [],
      payload: {
        state: { credit_usd: 110000, terms: "credit + auto-enrollment in regression alerts" },
        rationale:
          "Conceding 39% on the headline figure in exchange for a structural commitment that prevents recurrence.",
        utility_for_self: 0.78,
      },
    }),
    () => ({
      type: "CounterPropose",
      round: 3,
      from_agent: atlasDid,
      evidence_refs: atlasEvidenceHashes,
      parent_refs: [],
      payload: {
        state: {
          credit_usd: 90000,
          terms: "credit + alerts opt-in + customer commits to eval API in next renewal",
        },
        rationale:
          "Largest goodwill envelope authorized when paired with two structural commitments from Customer side. This protects against precedent risk.",
        utility_for_self: 0.81,
      },
    }),
    // R4: both Accept Atlas R3
    (h) => {
      // Find Atlas's last counter-propose
      const target = lastOpponentProposal(h, ariaDid);
      const targetHash = target ? docHash(target) : "";
      return {
        type: "Accept",
        round: 4,
        from_agent: ariaDid,
        evidence_refs: [],
        parent_refs: [targetHash],
        payload: { target_msg_hash: targetHash },
      };
    },
    (h) => {
      // Atlas accepts the same target (its own R3 proposal)
      const ownR3 = findOwnLastProposal(h, atlasDid);
      const targetHash = ownR3 ? docHash(ownR3) : "";
      return {
        type: "Accept",
        round: 4,
        from_agent: atlasDid,
        evidence_refs: [],
        parent_refs: [targetHash],
        payload: { target_msg_hash: targetHash },
      };
    },
  ];

  let idx = 0;
  return {
    async emit(input) {
      if (idx >= script.length) throw new Error("mock driver script exhausted");
      const fn = script[idx++]!;
      // Small delay to make the live stream feel real
      await new Promise((r) => setTimeout(r, 120));
      return fn(input.history);
    },
  };
}
