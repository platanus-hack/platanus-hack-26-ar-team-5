"use client";

import type {
  AgentRole,
  Bundle,
  DisputeDump,
  DumpProposeMsg,
  RulingOutcome,
} from "./types";
import { readStateTiers, shortDid } from "./format";

type Outcome = Bundle["outcome"];

type Props = {
  dispute: DisputeDump;
  onWithdraw: (
    dispute_id: string,
    role: AgentRole,
    reason: string,
  ) => Promise<void>;
};

const RULING_PHRASE: Record<RulingOutcome, string> = {
  claimant_prevails: "Claimant prevails",
  claimant_partial: "Claimant partial",
  respondent_prevails: "Respondent prevails",
  abstain: "Inconclusive",
};

/**
 * The single block at the top of every dispute view. Everything a fresh
 * viewer needs to "get it" in 10 seconds: status, claim, both sides' current
 * positions, what's next.
 */
export function DisputeHero({ dispute, onWithdraw }: Props) {
  const status = describeStatus(dispute);
  const aria = lastProposalBy(dispute, "aria");
  const atlas = lastProposalBy(dispute, "atlas");
  const finalized = !!dispute.finalized;

  return (
    <section className="rounded-lg border border-line/70 bg-graphite/40">
      <header className="border-b border-line/40 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 text-caption">
          <span
            className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
            aria-hidden="true"
          />
          <span className={status.tone}>{status.label}</span>
          <span className="text-dim" aria-hidden="true">
            ·
          </span>
          <span className="text-ash-gray">{status.metaLine}</span>
          {dispute.tribunal_mode === "none" && !finalized && (
            <>
              <span className="text-dim" aria-hidden="true">
                ·
              </span>
              <span className="text-warn-red">no tribunal</span>
            </>
          )}
        </div>
        <p className="mt-1.5 text-body text-polar-white">
          {dispute.claim ?? "Schema-less dispute (no claim text)."}
        </p>
      </header>

      <div className="grid grid-cols-1 divide-y divide-line/30 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <PartySnapshot
          role="aria"
          label="Claimant"
          did={dispute.agents.aria}
          prop={aria}
          isTurn={dispute.turn === "aria" && !finalized}
        />
        <PartySnapshot
          role="atlas"
          label="Respondent"
          did={dispute.agents.atlas}
          prop={atlas}
          isTurn={dispute.turn === "atlas" && !finalized}
        />
      </div>

      {!finalized && (
        <footer className="flex flex-wrap items-center gap-3 border-t border-line/40 px-5 py-3 text-caption text-ash-gray">
          <span className="min-w-0 flex-1">{nextStepHint(dispute)}</span>
          <div className="flex shrink-0 items-center gap-2">
            <WithdrawLink
              role="aria"
              onClick={() =>
                onWithdraw(
                  dispute.dispute_id,
                  "aria",
                  "Aria walked from the dashboard.",
                )
              }
            />
            <WithdrawLink
              role="atlas"
              onClick={() =>
                onWithdraw(
                  dispute.dispute_id,
                  "atlas",
                  "Atlas walked from the dashboard.",
                )
              }
            />
          </div>
        </footer>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Party snapshot
// ---------------------------------------------------------------------------

function PartySnapshot({
  role,
  label,
  did,
  prop,
  isTurn,
}: {
  role: AgentRole;
  label: string;
  did: string;
  prop: DumpProposeMsg | null;
  isTurn: boolean;
}) {
  const tone = role === "aria" ? "text-aria" : "text-atlas";
  const headline = prop ? formatHeadline(prop.payload.state) : null;
  return (
    <div className="flex flex-col gap-2 px-5 py-4">
      <div className="flex items-baseline justify-between gap-3 text-caption">
        <span>
          <span className={`${tone} font-medium`}>{role}</span>
          <span className="text-ash-gray"> · {label}</span>
        </span>
        {isTurn && (
          <span className={`${tone} text-caption`}>their turn</span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[20px] font-medium tabular text-polar-white">
          {headline ?? <span className="text-dim">·</span>}
        </span>
        {prop && (
          <span className="text-caption text-ash-gray tabular">
            utility {prop.payload.utility_for_self.toFixed(2)}
          </span>
        )}
      </div>
      {prop?.payload.rationale && (
        <p className="line-clamp-2 text-caption leading-relaxed text-ash-gray">
          “{prop.payload.rationale}”
        </p>
      )}
      <span className="font-mono text-caption text-dim">
        {shortDid(did)}
      </span>
    </div>
  );
}

function WithdrawLink({
  role,
  onClick,
}: {
  role: AgentRole;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-caption text-warn-red/70 transition-colors hover:text-warn-red"
    >
      {role} withdraws
    </button>
  );
}

// ---------------------------------------------------------------------------
// Status descriptor
// ---------------------------------------------------------------------------

type StatusView = {
  label: string;
  tone: string;
  dot: string;
  metaLine: string;
};

function describeStatus(d: DisputeDump): StatusView {
  if (!d.finalized) {
    return {
      label: "Live",
      tone: "text-pulse-green",
      dot: "bg-pulse-green",
      metaLine: `round ${d.current_round} of ${d.max_rounds} · ${d.turn}'s turn`,
    };
  }
  const o: Outcome = d.finalized.outcome;
  if (o.kind === "converged") {
    return {
      label: "Converged",
      tone: "text-pulse-green",
      dot: "bg-pulse-green",
      metaLine: `settled in round ${d.current_round}`,
    };
  }
  if (o.kind === "ruling") {
    return {
      label: "Tribunal ruling",
      tone: "text-atlas",
      dot: "bg-atlas",
      metaLine: `${RULING_PHRASE[o.ruling.outcome]} · ${(o.ruling.confidence * 100).toFixed(0)}% confident`,
    };
  }
  if (o.kind === "withdrawn") {
    return {
      label: "Withdrawn",
      tone: "text-warn-red",
      dot: "bg-warn-red",
      metaLine: `${o.withdrawn_role} walked at round ${d.current_round}`,
    };
  }
  return {
    label: "Deadline",
    tone: "text-warn-red",
    dot: "bg-warn-red",
    metaLine: `hit round ${d.max_rounds} without converging`,
  };
}

// ---------------------------------------------------------------------------
// Next-step hint (only when live)
// ---------------------------------------------------------------------------

function nextStepHint(d: DisputeDump): string {
  const turn = d.turn;
  const opener = d.history.length === 0;
  if (opener) {
    return `${turn} opens with a Propose.`;
  }
  if (d.tribunal_mode === "none") {
    return `${turn} can Accept, CounterPropose, or Critique. Escalate is disabled (tribunal_mode=none).`;
  }
  return `${turn} can Accept, CounterPropose, Critique, or Escalate to the tribunal.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lastProposalBy(
  d: DisputeDump,
  role: AgentRole,
): DumpProposeMsg | null {
  const did = d.agents[role];
  for (let i = d.history.length - 1; i >= 0; i--) {
    const m = d.history[i]!;
    if (
      (m.type === "Propose" || m.type === "CounterPropose") &&
      m.from_agent === did
    ) {
      return m as DumpProposeMsg;
    }
  }
  return null;
}

function formatHeadline(state: unknown): string | null {
  const tiers = readStateTiers(state);
  for (const [k, v] of tiers) {
    if (typeof v === "number" && v !== 0) {
      if (k === "credit_usd") return formatCurrency(v);
      return v.toLocaleString();
    }
  }
  for (const [, v] of tiers) {
    if (typeof v === "string" && v.trim()) {
      return v.length > 40 ? `${v.slice(0, 40).trim()}…` : v;
    }
  }
  return null;
}

function formatCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `$${n.toLocaleString()}`;
  return `$${n}`;
}
