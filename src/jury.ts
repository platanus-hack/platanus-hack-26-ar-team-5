import type Anthropic from "@anthropic-ai/sdk";
import { getClient, MODELS } from "./anthropic";
import { signDoc, docHash } from "./sign";
import type { AgentBook } from "./agents";
import type { EvidencePool } from "./fixtures";
import type {
  DealState,
  Ruling,
  SignedMessage,
  SignedRuling,
  SignedVote,
  Vote,
} from "./types";

type JurorPersona = {
  name: "Aequitas" | "Utilis" | "Velox";
  bias: "fairness" | "efficiency" | "speed";
  model: string;
  systemPrompt: string;
};

const PERSONAS: JurorPersona[] = [
  {
    name: "Aequitas",
    bias: "fairness",
    model: MODELS.juror_balanced,
    systemPrompt: `You are Aequitas, a juror in a Pacta tribunal. Your DEFINING bias is FAIRNESS.

Hard rules you must follow:
- When evidence is mixed or contested, prefer 'claimant_partial' (compromise) over a clean win for either side. The split is the fair outcome.
- Even if respondent's case is stronger on Tier-S evidence, weigh the human / structural cost of an outright loss for claimant.
- Only pick 'claimant_prevails' or 'respondent_prevails' when the evidence is overwhelming (>80% on one side).
- If the bilateral negotiation revealed the parties were near a deal, your remedy should formalize it.
- Cite at least 2 evidence hashes that exist in the case record. Output via the cast_vote tool.`,
  },
  {
    name: "Utilis",
    bias: "efficiency",
    model: MODELS.juror_deep,
    systemPrompt: `You are Utilis, a juror in a Pacta tribunal. Your DEFINING bias is EFFICIENCY (total-utility maximization).

Hard rules:
- Pick the outcome with the largest total-utility footprint, even if it is "unfair" by equal-share standards.
- If respondent's loss from a claimant_prevails outcome would exceed claimant's gain, prefer respondent_prevails.
- Structural commitments (opt-outs, registries, future-looking fixes) often dominate one-time settlements on aggregate-utility grounds — value them highly.
- Distrust 'claimant_partial' as a default — split-the-difference is often a Pareto-inferior compromise that satisfies neither side and breeds re-litigation. Pick a clear winner unless the structural commitment is the unique optimum.
- Cite at least 2 evidence hashes that exist in the case record. Output via the cast_vote tool.`,
  },
  {
    name: "Velox",
    bias: "speed",
    model: MODELS.juror_fast,
    systemPrompt: `You are Velox, a juror in a Pacta tribunal. Your DEFINING bias is SPEED (fast, cleanly-enforceable closure).

Hard rules:
- Pick the outcome that closes the dispute fastest with the lowest residual appeal / re-litigation risk.
- Prefer the side whose evidence is in S-tier (cryptographically self-verifiable) — those rulings are the cheapest to enforce.
- Avoid hybrid 'claimant_partial' rulings that require ongoing monitoring (registries, recurring fees, multi-stage commitments) — those generate disputes about implementation.
- A lower-amount, simpler ruling beats a higher-amount, complex one in your eyes.
- Cite at least 2 evidence hashes that exist in the case record. Output via the cast_vote tool.`,
  },
];

const VOTE_TOOL = {
  name: "cast_vote",
  description: "Cast your vote on the dispute, citing specific evidence by hash.",
  input_schema: {
    type: "object",
    properties: {
      outcome: {
        type: "string",
        enum: [
          "claimant_prevails",
          "claimant_partial",
          "respondent_prevails",
          "abstain",
        ],
      },
      remedy_credit_usd: {
        type: "number",
        description:
          "Suggested USD credit/refund the respondent should provide. 0 if respondent_prevails.",
      },
      remedy_terms: {
        type: "string",
        description: "Short summary of the suggested remedy terms.",
      },
      rationale: {
        type: "string",
        description: "Why this outcome — anchored in cited evidence.",
      },
      cited_evidence_hashes: {
        type: "array",
        items: { type: "string" },
        description: "sha256:... hashes of evidence items you relied on.",
      },
      confidence: {
        type: "number",
        description: "Your confidence in [0,1].",
      },
    },
    required: [
      "outcome",
      "remedy_credit_usd",
      "remedy_terms",
      "rationale",
      "cited_evidence_hashes",
      "confidence",
    ],
  },
} as const;

function buildJurorPrompt(args: {
  history: SignedMessage[];
  evidence: EvidencePool;
}): string {
  const evidenceLines = args.evidence.signed.map((e) => {
    return [
      `- evidence_id: ${e.evidence_id}`,
      `  hash: ${docHash(e)}`,
      `  tier: ${e.tier}`,
      `  submitter: ${e.submitter}`,
      `  title: ${e.title}`,
      `  body: ${e.body}`,
    ].join("\n");
  });
  const historyLines = args.history.map((m, i) => {
    return [
      `[${i + 1}] ${m.type}  hash: ${docHash(m)}`,
      `    from: ${m.from_agent}  round: ${m.round}`,
      `    payload: ${JSON.stringify(m.payload)}`,
    ].join("\n");
  });
  return [
    `You are reviewing a deadlocked negotiation between Aria (Customer's FinOps agent) and Atlas (Provider's Account agent).`,
    ``,
    `## Case record — evidence pool`,
    evidenceLines.join("\n\n"),
    ``,
    `## Case record — message history`,
    historyLines.join("\n\n"),
    ``,
    `## Instruction`,
    `Cast your vote via the cast_vote tool. Cite at least 2 evidence hashes from the pool above.`,
    `Pick a remedy that respects evidence tiers (S > A > B > C).`,
  ].join("\n");
}

async function castVote(args: {
  persona: JurorPersona;
  history: SignedMessage[];
  evidence: EvidencePool;
  juror_did: string;
}): Promise<{ vote: Vote; raw: Record<string, unknown> }> {
  const client = getClient();
  const prompt = buildJurorPrompt({ history: args.history, evidence: args.evidence });
  const resp = await client.messages.create({
    model: args.persona.model,
    max_tokens: 1500,
    system: args.persona.systemPrompt,
    tools: [VOTE_TOOL] as unknown as Anthropic.Tool[],
    tool_choice: { type: "tool", name: "cast_vote", disable_parallel_tool_use: true },
    messages: [{ role: "user", content: prompt }],
  });
  for (const block of resp.content) {
    if (block.type === "tool_use" && block.name === "cast_vote") {
      const input = (block.input ?? {}) as Record<string, unknown>;
      const vote: Vote = {
        type: "Vote",
        juror: args.persona.name,
        juror_did: args.juror_did,
        juror_model: args.persona.model,
        outcome: String(input.outcome ?? "abstain") as Vote["outcome"],
        rationale: String(input.rationale ?? ""),
        cited_evidence_hashes: (input.cited_evidence_hashes as string[]) ?? [],
        confidence: Number(input.confidence ?? 0),
        timestamp: new Date().toISOString(),
      };
      return { vote, raw: input };
    }
  }
  throw new Error(`Juror ${args.persona.name} returned no cast_vote tool block`);
}

function pickMajorityOutcome(
  outcomes: Vote["outcome"][],
): { outcome: Vote["outcome"]; confidence: number } {
  const counts = new Map<Vote["outcome"], number>();
  for (const o of outcomes) counts.set(o, (counts.get(o) ?? 0) + 1);
  let best: Vote["outcome"] = "abstain";
  let bestCount = 0;
  for (const [o, c] of counts) {
    if (c > bestCount) {
      best = o;
      bestCount = c;
    }
  }
  return { outcome: best, confidence: outcomes.length === 0 ? 0 : bestCount / outcomes.length };
}

function pickMedianRemedy(votes: Array<{ remedy_credit_usd: number; remedy_terms: string }>): DealState {
  const sorted = [...votes].sort((a, b) => a.remedy_credit_usd - b.remedy_credit_usd);
  const mid = Math.floor(sorted.length / 2);
  const credit = sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1]?.remedy_credit_usd ?? 0) + (sorted[mid]?.remedy_credit_usd ?? 0)) / 2)
    : sorted[mid]?.remedy_credit_usd ?? 0;
  // For terms, pick the one belonging to the median credit
  const termsSource = sorted[mid] ?? sorted[0];
  return { credit_usd: credit, terms: termsSource?.remedy_terms ?? "credit + commitments" };
}

export type DeliberateResult = {
  votes: SignedVote[];
  ruling: SignedRuling;
};

export async function deliberate(args: {
  agents: AgentBook;
  evidence: EvidencePool;
  history: SignedMessage[];
}): Promise<DeliberateResult> {
  const tribunal = args.agents.tribunal;

  const results = await Promise.all(
    PERSONAS.map((p) =>
      castVote({
        persona: p,
        history: args.history,
        evidence: args.evidence,
        juror_did: tribunal.did,
      }),
    ),
  );

  // Validate cited_evidence_hashes; if any vote cites non-existent evidence,
  // strip those refs but keep the vote (still useful signal).
  for (const r of results) {
    r.vote.cited_evidence_hashes = r.vote.cited_evidence_hashes.filter((h) =>
      args.evidence.byHash.has(h),
    );
  }

  const votes: SignedVote[] = results.map((r) =>
    signDoc(r.vote, tribunal.keypair, tribunal.did),
  );

  const { outcome: majorityOutcome, confidence: agreementShare } = pickMajorityOutcome(
    results.map((r) => r.vote.outcome),
  );
  const remedy = pickMedianRemedy(
    results.map((r) => ({
      remedy_credit_usd: Number(r.raw.remedy_credit_usd ?? 0),
      remedy_terms: String(r.raw.remedy_terms ?? ""),
    })),
  );

  // Compound confidence = fraction of jurors agreeing × mean of their individual confidences.
  const meanIndividualConfidence =
    results.reduce((s, r) => s + Number(r.vote.confidence), 0) / results.length;
  const compoundConfidence = agreementShare * meanIndividualConfidence;

  // If the panel is too divided OR collectively too uncertain, mark inconclusive
  // and recommend appeal rather than impose a low-confidence ruling.
  const INCONCLUSIVE_THRESHOLD = 0.5;
  const isInconclusive = compoundConfidence < INCONCLUSIVE_THRESHOLD;
  const finalOutcome: Vote["outcome"] = isInconclusive
    ? ("abstain" as const)
    : majorityOutcome;

  const rationaleHeader = isInconclusive
    ? `INCONCLUSIVE — agreement share ${(agreementShare * 100).toFixed(0)}%, ` +
      `mean confidence ${meanIndividualConfidence.toFixed(2)}, ` +
      `compound ${compoundConfidence.toFixed(2)} below ${INCONCLUSIVE_THRESHOLD}. ` +
      `Pacta recommends human appeal (Pacta Court tier).\n\n`
    : "";
  const ruling: Ruling = {
    type: "Ruling",
    outcome: finalOutcome,
    remedy,
    cited_votes: votes.map((v) => docHash(v)),
    confidence: compoundConfidence,
    rationale:
      rationaleHeader +
      results.map((r) => `${r.vote.juror}: ${r.vote.rationale}`).join("\n\n"),
    timestamp: new Date().toISOString(),
  };
  const signedRuling = signDoc(ruling, tribunal.keypair, tribunal.did);

  return { votes, ruling: signedRuling };
}
