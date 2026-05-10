"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  AgentRole,
  Bundle,
  DisputeDump,
  DumpProposeMsg,
  RulingOutcome,
} from "./types";
import { readStateTiers, shortHash } from "./format";
import { SimpleTimeline } from "./simple-timeline";
import { EvidenceRail } from "./evidence-rail";
import { DagGraph } from "./dag-graph";
import { OutcomeBanner } from "./outcome-banner";

type Outcome = Bundle["outcome"];

type Props = {
  dispute: DisputeDump;
};

const ease = [0.16, 1, 0.3, 1] as const;

const RULING_PHRASE: Record<RulingOutcome, string> = {
  claimant_prevails: "in favor of the claimant",
  claimant_partial: "a partial win for the claimant",
  respondent_prevails: "in favor of the respondent",
  abstain: "without a confident verdict",
};

/**
 * The entire main canvas for a selected dispute. One screen, three big
 * numbers, one sentence of explanation, two actions. Detail (timeline,
 * evidence, audit DAG, ruling rationale) lives behind modals so the default
 * view answers exactly one question: "what's the status, and where does the
 * money land?"
 */
export function DisputeView({ dispute }: Props) {
  const [open, setOpen] = useState<"none" | "moves" | "verify">("none");
  const status = describeStatus(dispute);
  const aria = lastProposalBy(dispute, "aria");
  const atlas = lastProposalBy(dispute, "atlas");
  const live = !dispute.finalized;

  const aw = aria ? positionFromProposal(aria) : null;
  const tw = atlas ? positionFromProposal(atlas) : null;
  const award = dispute.finalized
    ? extractOutcomePosition(dispute.finalized.outcome)
    : null;
  const awardTone = dispute.finalized ? pickAwardTone(dispute) : "neutral";

  return (
    <>
      <section className="rounded-xl border border-line/70 bg-graphite/40">
        <div className="flex flex-col gap-1.5 px-6 pt-5">
          <div className="flex flex-wrap items-center gap-2 text-caption">
            <span
              className={`h-1.5 w-1.5 rounded-full ${status.dot} ${live ? "pacta-pulse" : ""}`}
              aria-hidden="true"
            />
            <span className={status.tone}>{status.label}</span>
            <span className="text-dim" aria-hidden="true">
              ·
            </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={status.metaLine}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="text-ash-gray"
              >
                {status.metaLine}
              </motion.span>
            </AnimatePresence>
          </div>
          <p className="text-body font-medium text-polar-white">
            {dispute.context_summary ||
              dispute.claim ||
              dispute.scenario_id ||
              "Schema-less dispute"}
          </p>
          {dispute.context_summary && dispute.claim && (
            <p className="text-caption leading-relaxed text-ash-gray">
              {dispute.claim}
            </p>
          )}
        </div>

        <Numbers
          aria={aw}
          atlas={tw}
          award={award}
          awardTone={awardTone}
          live={live}
          scope={dispute.dispute_id}
        />

        <p className="px-6 pb-5 text-caption leading-relaxed text-bone">
          {explanation(dispute, aria, atlas)}
        </p>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line/40 px-6 py-3">
          <Action onClick={() => setOpen("moves")}>See the moves</Action>
          <Action onClick={() => setOpen("verify")} variant="ghost">
            Verify the bundle
          </Action>
        </footer>
      </section>

      <AnimatePresence>
        {open !== "none" && (
          <Modal
            onClose={() => setOpen("none")}
            title={open === "moves" ? "Moves" : "Verify"}
          >
            {open === "moves" ? (
              <MovesPanel dispute={dispute} />
            ) : (
              <VerifyPanel dispute={dispute} />
            )}
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Numbers row
// ---------------------------------------------------------------------------

type Tone = "aria" | "atlas" | "tribunal" | "neutral" | "dim";

function Numbers({
  aria,
  atlas,
  award,
  awardTone,
  live,
  scope,
}: {
  aria: Position | null;
  atlas: Position | null;
  award: Position | null;
  awardTone: Tone;
  live: boolean;
  /** Dispute id; used to suppress "just moved" animations when the user
   *  switches between disputes (every value is technically "new" then). */
  scope: string;
}) {
  // The "gap" concept is only meaningful when both sides expose a numeric
  // dimension (e.g. price). For text-only disputes we drop the third cell
  // when live and just surface the outcome when finalized.
  const numericGap =
    live &&
    aria?.kind === "number" &&
    atlas?.kind === "number"
      ? Math.abs(aria.value - atlas.value)
      : null;

  // Pick wording based on whether the dispute is monetary.
  const monetary = aria?.kind === "number" || atlas?.kind === "number";
  const ariaLabel = monetary ? "Aria asks" : "Aria's position";
  const atlasLabel = monetary ? "Atlas offered" : "Atlas's position";

  const showThird = !!award || numericGap !== null;
  const cols = showThird ? "sm:grid-cols-3" : "sm:grid-cols-2";

  return (
    <div
      className={`grid grid-cols-1 divide-y divide-line/30 px-6 py-5 ${cols} sm:divide-x sm:divide-y-0`}
    >
      <Cell tone="aria" label={ariaLabel} position={aria} scope={scope} />
      <Cell tone="atlas" label={atlasLabel} position={atlas} scope={scope} />
      {award ? (
        <Cell
          tone={awardTone}
          label="Outcome"
          position={award}
          scope={scope}
        />
      ) : numericGap !== null ? (
        <Cell
          tone="dim"
          label="Gap"
          position={{
            kind: "number",
            value: numericGap,
            formatted: formatGap(numericGap, aria, atlas),
          }}
          scope={scope}
        />
      ) : null}
    </div>
  );
}

const TONE_VALUE: Record<Tone, string> = {
  aria: "text-aria",
  atlas: "text-atlas",
  tribunal: "text-[#C084FC]",
  neutral: "text-polar-white",
  dim: "text-dim",
};

const TONE_GLOW: Record<Tone, string> = {
  aria: "shadow-[inset_0_0_0_1px_rgba(231,197,154,0.55)]",
  atlas: "shadow-[inset_0_0_0_1px_rgba(122,162,247,0.55)]",
  tribunal: "shadow-[inset_0_0_0_1px_rgba(192,132,252,0.55)]",
  neutral: "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)]",
  dim: "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]",
};

function Cell({
  tone,
  label,
  position,
  scope,
}: {
  tone: Tone;
  label: string;
  position: Position | null;
  scope: string;
}) {
  const valueKey = position
    ? `${position.kind}:${position.kind === "number" ? position.formatted : position.value}`
    : "empty";
  const justChanged = useJustChanged(valueKey, scope);

  return (
    <div className="relative flex flex-col gap-1.5 px-5 py-1">
      <AnimatePresence>
        {justChanged && (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className={`pointer-events-none absolute inset-0 rounded-md ${TONE_GLOW[tone]}`}
          />
        )}
      </AnimatePresence>
      <span className="relative flex items-center gap-2 text-caption text-ash-gray">
        {label}
        <AnimatePresence>
          {justChanged && (
            <motion.span
              key="just-moved"
              initial={{ opacity: 0, x: -2 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -2 }}
              transition={{ duration: 0.18 }}
              className={TONE_VALUE[tone]}
            >
              · just moved
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <div className="relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={valueKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            {position === null ? (
              <span className="text-[24px] font-medium leading-none text-dim">
                —
              </span>
            ) : position.kind === "number" ? (
              <div className="flex flex-col gap-1">
                <span
                  className={`text-[28px] font-medium leading-none tabular ${TONE_VALUE[tone]}`}
                >
                  {position.formatted}
                </span>
                {position.subtitle && (
                  <span className="line-clamp-2 text-caption leading-snug text-ash-gray">
                    {position.subtitle}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <span className={`text-body leading-snug ${TONE_VALUE[tone]}`}>
                  {position.value}
                </span>
                {position.subtitle && (
                  <span className="line-clamp-2 text-caption leading-snug text-ash-gray">
                    {position.subtitle}
                  </span>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Returns true for ~1.4s after `key` changes — but ONLY when `scope` stays
 * stable. When `scope` changes (e.g. user picked a different dispute) the
 * hook re-baselines silently without flashing, so swapping disputes never
 * triggers spurious "just moved" rectangles on every cell.
 */
function useJustChanged(key: string, scope: string): boolean {
  const [flag, setFlag] = useState(false);
  const prev = useRef<{ scope: string; key: string }>({ scope, key });
  useEffect(() => {
    if (prev.current.scope !== scope) {
      prev.current = { scope, key };
      setFlag(false);
      return;
    }
    if (prev.current.key === key) return;
    prev.current = { scope, key };
    setFlag(true);
    const t = setTimeout(() => setFlag(false), 1400);
    return () => clearTimeout(t);
  }, [key, scope]);
  return flag;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-deep-space/80 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 12 }}
        transition={{ duration: 0.22, ease }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl rounded-xl border border-line/70 bg-graphite shadow-xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-3">
          <h3 className="text-body font-medium text-polar-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-caption text-ash-gray transition-colors hover:text-bone"
          >
            Close
          </button>
        </header>
        <div className="max-h-[78vh] overflow-y-auto p-5">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function MovesPanel({ dispute }: { dispute: DisputeDump }) {
  const empty = dispute.history.length === 0 && !dispute.finalized;
  if (empty) {
    return (
      <p className="text-caption text-dim">Waiting for the first move…</p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <SimpleTimeline dispute={dispute} />
      {dispute.evidence.length > 0 && <EvidenceRail dispute={dispute} />}
    </div>
  );
}

function VerifyPanel({ dispute }: { dispute: DisputeDump }) {
  return (
    <div className="flex flex-col gap-5">
      {dispute.finalized && (
        <BundleStrip
          rootHash={dispute.finalized.root_hash}
          evidenceCount={dispute.finalized.evidence.length}
          messageCount={dispute.finalized.messages.length}
        />
      )}
      {dispute.finalized && <OutcomeBanner dispute={dispute} />}
      <p className="text-caption text-dim">
        Each move and the final bundle are Ed25519-signed and content-addressed.
        Re-run{" "}
        <code className="font-mono text-bone">
          pnpm verify &lt;bundle.json&gt;
        </code>{" "}
        offline to re-check every signature without trusting this UI.
      </p>
    </div>
  );
}

function BundleStrip({
  rootHash,
  evidenceCount,
  messageCount,
}: {
  rootHash: string;
  evidenceCount: number;
  messageCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line/70 bg-deep-space/40 px-4 py-2.5 text-caption">
      <span className="text-ash-gray">Signed bundle</span>
      <span className="font-mono text-bone">
        sha256:{shortHash(rootHash, 28)}
      </span>
      <span className="ml-auto text-dim tabular">
        {evidenceCount} evidence · {messageCount} messages
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

function Action({
  onClick,
  variant = "primary",
  children,
}: {
  onClick: () => void;
  variant?: "primary" | "ghost";
  children: React.ReactNode;
}) {
  const cls =
    variant === "primary"
      ? "bg-polar-white text-deep-space hover:bg-bone"
      : "border border-line/70 text-bone hover:border-line hover:bg-iron/60";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3.5 py-1.5 text-caption font-medium transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Status + explanation
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
  const o = d.finalized.outcome;
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
      metaLine: `${(o.ruling.confidence * 100).toFixed(0)}% confident`,
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

function explanation(
  d: DisputeDump,
  aria: DumpProposeMsg | null,
  atlas: DumpProposeMsg | null,
): string {
  if (d.finalized) {
    const o = d.finalized.outcome;
    if (o.kind === "ruling") {
      const phrase = RULING_PHRASE[o.ruling.outcome];
      return `Three independent LLMs reviewed the case and ruled ${phrase}.`;
    }
    if (o.kind === "converged") {
      return `Both sides accepted the same proposal — no tribunal needed.`;
    }
    if (o.kind === "withdrawn") {
      return o.reason || `${o.withdrawn_role} walked away.`;
    }
    return `Max rounds elapsed without a converging Accept.`;
  }
  const turn = d.turn;
  const opener = !aria && !atlas;
  if (opener) return `${cap(turn)} opens with a Propose.`;
  if (d.tribunal_mode === "none") {
    return `${cap(turn)} can accept, counter, or critique. Escalation is disabled (tribunal_mode=none).`;
  }
  return `${cap(turn)} can accept, counter, critique, or escalate to the tribunal.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Position =
  | { kind: "number"; value: number; formatted: string; subtitle?: string }
  | { kind: "text"; value: string; subtitle?: string };

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

/**
 * Pick the most readable representation of a state for the headline cell.
 *
 *   number with terms text → big number + terms as subtitle (the WHAT the
 *                            money is for — not just "$1,800")
 *   number with no terms   → big number + agent's rationale as subtitle
 *                            (the WHY)
 *   text only              → text as the headline; no subtitle
 *
 * Schema-agnostic: works for monetary, grade, due-date, or any free-form
 * Pacta state shape. Falls back gracefully when fields are missing.
 */
function positionFromState(
  state: unknown,
  fallbackSubtitle?: string,
): Position | null {
  const tiers = readStateTiers(state);
  let numeric: number | null = null;
  let formatted = "—";
  let textValue: string | null = null;
  for (const [k, v] of tiers) {
    if (typeof v === "number" && v !== 0 && numeric === null) {
      numeric = v;
      formatted = k === "credit_usd" ? formatCurrency(v) : v.toLocaleString();
    } else if (typeof v === "string" && v.trim() && textValue === null) {
      textValue = v.trim();
    }
  }

  if (numeric !== null) {
    return {
      kind: "number",
      value: numeric,
      formatted,
      subtitle: textValue ?? fallbackSubtitle,
    };
  }
  if (textValue !== null) {
    return { kind: "text", value: textValue };
  }
  return null;
}

function positionFromProposal(prop: DumpProposeMsg): Position | null {
  // Prefer the state's `terms` text as the subtitle (what the money is FOR).
  // If state has no text, surface the agent's rationale (WHY they want it).
  return positionFromState(prop.payload.state, prop.payload.rationale);
}

function extractOutcomePosition(o: Outcome): Position | null {
  if (o.kind === "converged") return positionFromState(o.final_state);
  if (o.kind === "ruling") return positionFromState(o.ruling.remedy);
  return null;
}

/**
 * The Outcome cell needs to telegraph WHO won at a glance. Default of
 * `amber-glow` made everything look like an Aria win because that hex is
 * literally the same as `--color-aria`.
 *
 *   converged          → neutral white (both sides agreed; no winner)
 *   claimant prevails  → aria color
 *   respondent wins    → atlas color
 *   partial / abstain  → tribunal purple (mixed verdict)
 */
function pickAwardTone(d: DisputeDump): Tone {
  if (!d.finalized) return "neutral";
  const o = d.finalized.outcome;
  if (o.kind === "converged") return "neutral";
  if (o.kind === "ruling") {
    const r = o.ruling.outcome;
    if (r === "claimant_prevails") return "aria";
    if (r === "respondent_prevails") return "atlas";
    return "tribunal";
  }
  return "neutral";
}

function formatCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `$${n.toLocaleString()}`;
  return `$${n}`;
}

function formatGap(
  n: number,
  aria: Position | null,
  atlas: Position | null,
): string {
  // If either side used credit_usd, render the gap as currency. Otherwise
  // raw number. Heuristic: when both formatted strings start with "$".
  const both =
    aria?.kind === "number" &&
    atlas?.kind === "number" &&
    aria.formatted.startsWith("$") &&
    atlas.formatted.startsWith("$");
  return both ? formatCurrency(n) : n.toLocaleString();
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
