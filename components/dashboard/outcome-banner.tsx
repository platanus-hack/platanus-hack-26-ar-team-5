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
import { Rationale } from "./rationale";
import { Collapsible, Chevron } from "../ui/collapsible";

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

type Tone = "settled" | "ruled" | "failed";

const TONE_DOT: Record<Tone, string> = {
  settled: "bg-pulse-green",
  ruled: "bg-atlas",
  failed: "bg-warn-red",
};

const TONE_LABEL: Record<Tone, string> = {
  settled: "text-pulse-green",
  ruled: "text-atlas",
  failed: "text-warn-red",
};

type Props = { dispute: DisputeDump };

// ---------------------------------------------------------------------------
// Public entry — figures out the tone + delegates body to a small variant fn.
// ---------------------------------------------------------------------------

export function OutcomeBanner({ dispute }: Props) {
  if (!dispute.finalized) return null;
  const outcome = dispute.finalized.outcome;

  if (outcome.kind === "converged") {
    const accepted = findAcceptedProposal(
      dispute.history,
      outcome.accepted_msg_hash,
    );
    return (
      <Shell
        dispute={dispute}
        tone="settled"
        status="Converged"
        headline={`Settled in ${dispute.current_round} ${dispute.current_round === 1 ? "round" : "rounds"}.`}
      >
        <ConvergedBody
          dispute={dispute}
          accepted={accepted}
          acceptedHash={outcome.accepted_msg_hash}
        />
      </Shell>
    );
  }

  if (outcome.kind === "ruling") {
    const r = outcome.ruling;
    return (
      <Shell
        dispute={dispute}
        tone="ruled"
        status="Tribunal ruling"
        headline={
          <>
            <span className={OUTCOME_TONE[r.outcome]}>
              {OUTCOME_LABEL[r.outcome]}
            </span>
            <span className="text-ash-gray">
              {" — "}
              {(r.confidence * 100).toFixed(0)}% confidence
            </span>
          </>
        }
      >
        <RuledBody votes={outcome.votes} ruling={r} />
      </Shell>
    );
  }

  if (outcome.kind === "withdrawn") {
    return (
      <Shell
        dispute={dispute}
        tone="failed"
        status="Withdrawn"
        headline={
          <>
            <span
              className={
                outcome.withdrawn_role === "aria" ? "text-aria" : "text-atlas"
              }
            >
              {outcome.withdrawn_role}
            </span>{" "}
            walked at round {dispute.current_round}/{dispute.max_rounds}.
          </>
        }
      >
        <WithdrawnBody reason={outcome.reason} />
      </Shell>
    );
  }

  return (
    <Shell
      dispute={dispute}
      tone="failed"
      status="Deadline"
      headline={`No agreement reached at round ${dispute.current_round}/${dispute.max_rounds}.`}
    >
      <DeadlineBody noTribunal={dispute.tribunal_mode === "none"} />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Shared shell — same chrome for every outcome. One container, one type scale.
// ---------------------------------------------------------------------------

function Shell({
  tone,
  status,
  headline,
  children,
  dispute,
}: {
  tone: Tone;
  status: string;
  headline: React.ReactNode;
  children?: React.ReactNode;
  dispute: DisputeDump;
}) {
  return (
    <section className="rounded-lg border border-line/70 bg-graphite/40">
      <div className="flex flex-col gap-1 px-5 py-4 border-b border-line/40">
        <div className="flex items-center gap-2 text-caption">
          <span
            className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`}
            aria-hidden="true"
          />
          <span className={TONE_LABEL[tone]}>{status}</span>
        </div>
        <p className="text-body text-polar-white">{headline}</p>
      </div>
      {children && <div className="px-5 py-4">{children}</div>}
      <BundleRow dispute={dispute} />
    </section>
  );
}

function BundleRow({ dispute }: { dispute: DisputeDump }) {
  if (!dispute.finalized) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line/40 px-5 py-3 text-caption">
      <span className="text-ash-gray">Signed bundle</span>
      <span className="font-mono text-bone">
        sha256:{shortHash(dispute.finalized.root_hash, 24)}
      </span>
      <span className="ml-auto text-dim tabular">
        {dispute.finalized.evidence.length} evidence ·{" "}
        {dispute.finalized.messages.length} messages
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable label/value row — used by every variant body.
// ---------------------------------------------------------------------------

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-baseline gap-4 py-1.5 text-caption">
      <dt className="text-ash-gray">{label}</dt>
      <dd className="text-polar-white">{children}</dd>
    </div>
  );
}

function DefList({ children }: { children: React.ReactNode }) {
  return <dl className="divide-y divide-line/30">{children}</dl>;
}

// ---------------------------------------------------------------------------
// Variant 1 — bilateral convergence
// ---------------------------------------------------------------------------

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

function ConvergedBody({
  dispute,
  accepted,
  acceptedHash,
}: {
  dispute: DisputeDump;
  accepted: DumpProposeMsg | null;
  acceptedHash: string;
}) {
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
    <DefList>
      {proposedBy && (
        <Row label="Proposed by">
          <RoleTag role={proposedBy} />
        </Row>
      )}
      {acceptedBy && (
        <Row label="Accepted by">
          <RoleTag role={acceptedBy} />
        </Row>
      )}
      {tiers.length === 0 && (
        <Row label="Accepted hash">
          <span className="font-mono">#{shortHash(acceptedHash, 14)}</span>
        </Row>
      )}
      {tiers.map(([k, v]) => (
        <Row key={k} label={termLabel(k)}>
          <span className="tabular">{formatTermValue(v)}</span>
        </Row>
      ))}
    </DefList>
  );
}

function RoleTag({ role }: { role: AgentRole }) {
  const cls = role === "aria" ? "text-aria" : "text-atlas";
  return <span className={cls}>{role}</span>;
}

// ---------------------------------------------------------------------------
// Variant 2 — tribunal ruling
// ---------------------------------------------------------------------------

function RuledBody({
  votes,
  ruling,
}: {
  votes: DumpSignedVote[];
  ruling: DumpSignedRuling;
}) {
  const remedyTiers = readStateTiers(ruling.remedy);
  return (
    <div className="flex flex-col gap-5">
      <DefList>
        {votes.map((v) => (
          <Row key={`${v.juror}-${v.juror_model}`} label={v.juror}>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
              <span className={OUTCOME_TONE[v.outcome]}>
                {OUTCOME_LABEL[v.outcome]}
              </span>
              <span className="text-ash-gray tabular">
                {(v.confidence * 100).toFixed(0)}%
              </span>
              <span className="text-dim">
                {v.juror_model.replace(/^claude-/, "")}
              </span>
            </div>
          </Row>
        ))}
        {remedyTiers.map(([k, v]) => (
          <Row key={k} label={termLabel(k)}>
            <span className="tabular">{formatTermValue(v)}</span>
          </Row>
        ))}
      </DefList>

      <Collapsible
        triggerClassName="flex w-full cursor-pointer items-center gap-2 text-left text-caption text-ash-gray transition-colors hover:text-bone"
        trigger={(open) => (
          <>
            <Chevron open={open} />
            <span>Ruling rationale</span>
            <span className="text-dim">
              · {votes.length} {votes.length === 1 ? "juror" : "jurors"}
            </span>
          </>
        )}
      >
        <Rationale text={ruling.rationale} />
      </Collapsible>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant 3 — deadline
// ---------------------------------------------------------------------------

function DeadlineBody({ noTribunal }: { noTribunal: boolean }) {
  if (!noTribunal) {
    return (
      <p className="text-caption text-bone">
        Max rounds elapsed without a converging Accept and the parties did not
        Escalate. The bundle records the deadlock.
      </p>
    );
  }
  return (
    <p className="text-caption text-bone">
      Both parties opted out of the Tribunal at open
      (<code className="font-mono text-warn-red">tribunal_mode=none</code>).
      The signed bundle records the deadlock with no remedy and no winner.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Variant 4 — withdrawn
// ---------------------------------------------------------------------------

function WithdrawnBody({ reason }: { reason: string }) {
  return (
    <DefList>
      <Row label="Reason">
        <span className="text-bone">{reason}</span>
      </Row>
    </DefList>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function termLabel(key: string): string {
  // Pretty-print the schema keys so the def list reads naturally.
  if (key === "credit_usd") return "Credit (USD)";
  if (key === "terms") return "Terms";
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
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
