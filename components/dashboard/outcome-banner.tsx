"use client";

import type {
  AgentRole,
  DisputeDump,
  DumpMessage,
  DumpProposeMsg,
  DumpSignedRuling,
  DumpSignedVote,
  RulingOutcome,
} from "./types";
import { readStateTiers, shortHash } from "./format";

const OUTCOME_LABEL: Record<RulingOutcome, string> = {
  claimant_prevails: "Claimant prevails",
  claimant_partial: "Claimant partial",
  respondent_prevails: "Respondent prevails",
  abstain: "Inconclusive",
};

const OUTCOME_TONE: Record<RulingOutcome, string> = {
  claimant_prevails: "text-aria",
  claimant_partial: "text-amber-glow",
  respondent_prevails: "text-atlas",
  abstain: "text-warn-red",
};

type Props = {
  dispute: DisputeDump;
};

export function OutcomeBanner({ dispute }: Props) {
  if (!dispute.finalized) return null;
  const outcome = dispute.finalized.outcome;
  if (outcome.kind === "converged") {
    return <ConvergedBanner dispute={dispute} acceptedHash={outcome.accepted_msg_hash} />;
  }
  if (outcome.kind === "ruling") {
    return (
      <RuledBanner
        dispute={dispute}
        votes={outcome.votes}
        ruling={outcome.ruling}
      />
    );
  }
  return <DeadlineBanner dispute={dispute} />;
}

/** Find the Propose / CounterPropose that was Accepted (where the deal lives). */
function findAcceptedProposal(
  history: DumpMessage[],
  acceptedHash: string,
): DumpProposeMsg | null {
  for (const m of history) {
    if (
      (m.type === "Propose" || m.type === "CounterPropose") &&
      m.hash === acceptedHash
    ) {
      return m as DumpProposeMsg;
    }
  }
  return null;
}

function ConvergedBanner({
  dispute,
  acceptedHash,
}: {
  dispute: DisputeDump;
  acceptedHash: string;
}) {
  const accepted = findAcceptedProposal(dispute.history, acceptedHash);
  // The state shape can be flat ({credit_usd, terms}) or wrapped
  // ({domain, tiers}); readStateTiers tolerates both.
  const tiers: Array<[string, unknown]> = accepted
    ? readStateTiers(accepted.payload.state)
    : [];
  const ariaDid = dispute.agents.aria;
  const proposedBy: AgentRole | null = accepted
    ? accepted.from_agent === ariaDid
      ? "aria"
      : "atlas"
    : null;
  const acceptedBy: AgentRole | null = proposedBy === "aria" ? "atlas" : "aria";

  return (
    <section className="overflow-hidden rounded-lg border border-amber-glow/40 bg-graphite/40">
      {/* Hero */}
      <div className="flex items-end justify-between gap-6 border-b border-amber-glow/20 bg-amber-glow/5 px-6 py-5">
        <div>
          <div className="t-body uppercase tracking-[0.22em] text-amber-glow">
            Outcome
          </div>
          <h3 className="mt-1 text-[28px] font-light leading-tight tracking-[-0.01em] text-polar-white">
            Settled in {dispute.current_round}{" "}
            {dispute.current_round === 1 ? "round" : "rounds"}.
          </h3>
        </div>
        {proposedBy && acceptedBy && (
          <p className="t-body text-ash-gray">
            <span className={proposedBy === "aria" ? "text-aria" : "text-atlas"}>
              {proposedBy}
            </span>{" "}
            proposed,{" "}
            <span className={acceptedBy === "aria" ? "text-aria" : "text-atlas"}>
              {acceptedBy}
            </span>{" "}
            accepted.
          </p>
        )}
      </div>

      {/* Final terms */}
      {tiers.length > 0 ? (
        <div className="grid grid-cols-1 gap-px bg-line/40 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map(([k, v]) => (
            <div key={k} className="bg-graphite/40 px-5 py-4">
              <div className="t-body uppercase tracking-[0.18em] text-ash-gray">
                {k}
              </div>
              <div className="mt-1.5 text-[20px] font-light tabular text-polar-white">
                {formatTermValue(v)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-6 py-5">
          <p className="t-label text-bone">
            Both agents converged on the proposal at{" "}
            <span className="font-mono text-amber-glow">
              #{shortHash(acceptedHash, 12)}
            </span>
            . Open it in the timeline above to see the full state and rationale.
          </p>
        </div>
      )}

      <BundleFooter dispute={dispute} />
    </section>
  );
}

function RuledBanner({
  dispute,
  votes,
  ruling,
}: {
  dispute: DisputeDump;
  votes: DumpSignedVote[];
  ruling: DumpSignedRuling;
}) {
  const outcomeLabel = OUTCOME_LABEL[ruling.outcome];
  const outcomeTone = OUTCOME_TONE[ruling.outcome];
  const remedyTiers = readStateTiers(ruling.remedy);

  return (
    <section className="overflow-hidden rounded-lg border border-atlas/40 bg-graphite/40">
      {/* Hero */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-atlas/20 bg-atlas/5 px-6 py-5">
        <div>
          <div className="t-body uppercase tracking-[0.22em] text-atlas">
            Tribunal ruling
          </div>
          <h3
            className={`mt-1 text-[28px] font-light leading-tight tracking-[-0.01em] ${outcomeTone}`}
          >
            {outcomeLabel}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="t-body uppercase tracking-[0.18em] text-dim">
            Confidence
          </span>
          <span className="text-[22px] font-light tabular text-polar-white">
            {(ruling.confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Jury votes */}
      <div className="grid grid-cols-1 gap-px bg-line/40 lg:grid-cols-3">
        {votes.map((v) => (
          <JurorCard key={v.juror_did} v={v} />
        ))}
      </div>

      {/* Remedy + ruling rationale */}
      <div className="grid grid-cols-1 gap-5 border-t border-line/40 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="t-body uppercase tracking-[0.18em] text-ash-gray">
            Ruling rationale
          </div>
          <p className="mt-2 t-label leading-[22px] text-bone">
            {ruling.rationale}
          </p>
        </div>
        {remedyTiers.length > 0 && (
          <div>
            <div className="t-body uppercase tracking-[0.18em] text-ash-gray">
              Remedy
            </div>
            <dl className="mt-2 space-y-1.5">
              {remedyTiers.map(([k, v]) => (
                <div
                  key={k}
                  className="grid grid-cols-[110px_1fr] gap-2 t-body"
                >
                  <dt className="text-ash-gray/70">{k}</dt>
                  <dd className="font-mono text-polar-white">
                    {formatTermValue(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <BundleFooter dispute={dispute} />
    </section>
  );
}

function JurorCard({ v }: { v: DumpSignedVote }) {
  return (
    <div className="bg-graphite/40 px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="t-label text-polar-white">{v.juror}</span>
          <span className="t-body text-dim">
            {v.juror_model.replace(/^claude-/, "")}
          </span>
        </div>
        <span className="t-body tabular text-bone">
          {(v.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <div className={`mt-2 t-label ${OUTCOME_TONE[v.outcome]}`}>
        {OUTCOME_LABEL[v.outcome]}
      </div>
      {v.rationale && (
        <p className="mt-2 line-clamp-3 t-body leading-[18px] text-ash-gray">
          {v.rationale}
        </p>
      )}
      {v.cited_evidence_hashes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 font-mono t-body text-dim">
          {v.cited_evidence_hashes.slice(0, 4).map((h) => (
            <span key={h}>#{shortHash(h, 8)}</span>
          ))}
          {v.cited_evidence_hashes.length > 4 && (
            <span>+{v.cited_evidence_hashes.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}

function DeadlineBanner({ dispute }: { dispute: DisputeDump }) {
  return (
    <section className="overflow-hidden rounded-lg border border-warn-red/40 bg-graphite/40">
      <div className="flex items-end justify-between gap-6 border-b border-warn-red/20 bg-warn-red/5 px-6 py-5">
        <div>
          <div className="t-body uppercase tracking-[0.22em] text-warn-red">
            Outcome
          </div>
          <h3 className="mt-1 text-[28px] font-light leading-tight tracking-[-0.01em] text-polar-white">
            No agreement reached.
          </h3>
        </div>
        <p className="t-body text-ash-gray">
          Round {dispute.current_round} of {dispute.max_rounds}.
        </p>
      </div>
      <BundleFooter dispute={dispute} />
    </section>
  );
}

function BundleFooter({ dispute }: { dispute: DisputeDump }) {
  if (!dispute.finalized) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line/40 bg-graphite/20 px-6 py-3">
      <span className="t-body uppercase tracking-[0.18em] text-ash-gray">
        Signed bundle
      </span>
      <span className="font-mono t-body text-bone">
        sha256:{shortHash(dispute.finalized.root_hash, 32)}
      </span>
      <span className="ml-auto t-body text-dim">
        {dispute.finalized.evidence.length} evidence ·{" "}
        {dispute.finalized.messages.length} messages
      </span>
    </div>
  );
}

function formatTermValue(v: unknown): string {
  if (typeof v === "number") {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (Math.abs(v) >= 1000) return v.toLocaleString();
    return v.toString();
  }
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return JSON.stringify(v);
}
