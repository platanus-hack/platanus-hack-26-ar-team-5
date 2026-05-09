"use client";

import type { DisputeDump, DumpMessage, DumpProposeMsg, AgentRole } from "./types";
import { shortDid, partyLabel } from "./format";

type Props = {
  dispute: DisputeDump;
};

export function PartiesRow({ dispute }: Props) {
  const aria = computePartyView("aria", dispute);
  const atlas = computePartyView("atlas", dispute);
  return (
    <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
      <PartyCard view={aria} align="left" />
      <Versus />
      <PartyCard view={atlas} align="right" />
    </div>
  );
}

type PartyView = {
  role: AgentRole;
  did: string;
  isTurn: boolean;
  isClaude: boolean;
  hasAccepted: boolean;
  acceptedTarget: string | null;
  lastUtility: number | null;
  lastValue: string | null;
  lastTerms: string | null;
  movesCount: number;
};

function computePartyView(role: AgentRole, dispute: DisputeDump): PartyView {
  const did = dispute.agents[role];
  const own = dispute.history.filter((m) => m.from_agent === did);
  const lastProp = lastProposal(own);
  const accepted = own.find((m) => m.type === "Accept");
  return {
    role,
    did,
    isTurn: dispute.turn === role && !dispute.finalized,
    isClaude: dispute.controllers[role] === "claude",
    hasAccepted: !!accepted,
    acceptedTarget:
      accepted && accepted.type === "Accept"
        ? accepted.payload.target_msg_hash
        : null,
    lastUtility: lastProp?.payload.utility_for_self ?? null,
    lastValue: lastProp ? formatStateValue(lastProp.payload.state) : null,
    lastTerms: lastProp ? lastProp.payload.rationale : null,
    movesCount: own.length,
  };
}

function lastProposal(messages: DumpMessage[]): DumpProposeMsg | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.type === "Propose" || m.type === "CounterPropose") {
      return m as DumpProposeMsg;
    }
  }
  return null;
}

function formatStateValue(state: { domain: string; tiers: Record<string, unknown> }): string {
  // Try common domains: dollars, percentages, treatment tiers, etc.
  const tiers = state.tiers ?? {};
  // Pick first numeric scalar in tiers as the "headline".
  for (const [, v] of Object.entries(tiers)) {
    if (typeof v === "number") {
      return formatNumber(v);
    }
  }
  // Fall back to the first string scalar.
  for (const [, v] of Object.entries(tiers)) {
    if (typeof v === "string") return v;
  }
  return state.domain;
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1000) {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  }
  return n.toLocaleString();
}

const PARTY_TONE: Record<AgentRole, { ring: string; text: string; label: string; accent: string }> = {
  aria: {
    ring: "ring-aria/30",
    text: "text-aria",
    label: "Claimant",
    accent: "bg-aria",
  },
  atlas: {
    ring: "ring-atlas/30",
    text: "text-atlas",
    label: "Respondent",
    accent: "bg-atlas",
  },
};

function PartyCard({ view, align }: { view: PartyView; align: "left" | "right" }) {
  const tone = PARTY_TONE[view.role];
  return (
    <article
      className={[
        "relative overflow-hidden rounded-lg border border-line/70 bg-graphite/60 p-5",
        view.isTurn ? `ring-1 ${tone.ring}` : "",
      ].join(" ")}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line to-transparent" />
      <div className={`flex items-center justify-between ${align === "right" ? "flex-row-reverse" : ""}`}>
        <div className={`flex items-center gap-2.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
          <span className={`h-2 w-2 rounded-full ${tone.accent}`} />
          <div className={align === "right" ? "text-right" : ""}>
            <div className={`text-caption font-medium uppercase tracking-[0.18em] ${tone.text}`}>
              {view.role}
            </div>
            <div className="text-micro text-ash-gray">{tone.label} · {partyLabel(view.role, null)}</div>
          </div>
        </div>
        <ControllerBadge isClaude={view.isClaude} />
      </div>

      <div className={`mt-5 ${align === "right" ? "text-right" : ""}`}>
        <div className="text-micro uppercase tracking-[0.18em] text-ash-gray">
          Latest proposal
        </div>
        <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular text-stat-lg text-polar-white">
          {view.lastValue ?? <span className="text-dim">—</span>}
        </div>
        {view.lastUtility !== null && (
          <div className="mt-1 text-micro text-ash-gray">
            utility{" "}
            <span className="font-mono tabular text-bone">
              {view.lastUtility.toFixed(2)}
            </span>
          </div>
        )}
        {view.lastTerms && (
          <p
            className={`mt-3 line-clamp-3 text-caption text-ash-gray ${
              align === "right" ? "text-right" : ""
            }`}
          >
            “{view.lastTerms}”
          </p>
        )}
      </div>

      <div className={`mt-5 flex items-center gap-3 text-micro text-dim ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span className="font-mono">{shortDid(view.did)}</span>
        <span aria-hidden>·</span>
        <span>{view.movesCount} moves</span>
        {view.hasAccepted && (
          <>
            <span aria-hidden>·</span>
            <span className="text-amber-glow">accepted</span>
          </>
        )}
      </div>
    </article>
  );
}

function ControllerBadge({ isClaude }: { isClaude: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-micro",
        isClaude
          ? "border-line bg-graphite/80 text-ash-gray"
          : "border-amber-glow/30 bg-amber-glow/5 text-amber-glow",
      ].join(" ")}
    >
      <span className={`h-1 w-1 rounded-full ${isClaude ? "bg-ash-gray" : "bg-amber-glow"}`} />
      {isClaude ? "claude" : "external"}
    </span>
  );
}

function Versus() {
  return (
    <div className="hidden flex-col items-center justify-center gap-2 lg:flex">
      <span className="text-micro uppercase tracking-[0.2em] text-dim">vs</span>
      <span className="h-10 w-px bg-line" />
    </div>
  );
}
