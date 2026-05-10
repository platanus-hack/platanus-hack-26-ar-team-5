"use client";

import { AnimatePresence, motion } from "framer-motion";
import type {
  AgentRole,
  Bundle,
  DisputeDump,
  DumpProposeMsg,
  RulingOutcome,
} from "./types";
import { readStateTiers } from "./format";

type Tone = "aria" | "atlas" | "tribunal" | "neutral";

type Row =
  | { kind: "move"; tone: Tone; headline: string; body: string | null }
  | { kind: "gap"; amount: string }
  | { kind: "outcome"; tone: Tone; headline: string; body: string | null };

const ease = [0.16, 1, 0.3, 1] as const;

const RULING_PHRASE: Record<RulingOutcome, string> = {
  claimant_prevails: "in favor of the claimant",
  claimant_partial: "a partial win for the claimant",
  respondent_prevails: "in favor of the respondent",
  abstain: "without a confident verdict",
};

type Props = { dispute: DisputeDump };

export function SimpleTimeline({ dispute }: Props) {
  const rows = buildRows(dispute);
  const live = !dispute.finalized;

  return (
    <ol className="relative flex flex-col">
      <span
        aria-hidden="true"
        className="absolute left-[7px] top-2 bottom-2 w-px bg-line/60"
      />
      <AnimatePresence initial={false}>
        {rows.map((r, i) =>
          r.kind === "gap" ? (
            <GapRow key={`gap-${i}`} amount={r.amount} index={i} />
          ) : (
            <EventRow
              key={`row-${i}-${r.headline}`}
              row={r}
              index={i}
            />
          ),
        )}
        {live && (
          <Pending key="pending" role={dispute.turn} />
        )}
      </AnimatePresence>
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function EventRow({
  row,
  index,
}: {
  row: Extract<Row, { kind: "move" } | { kind: "outcome" }>;
  index: number;
}) {
  const dotClass = TONE_DOT[row.tone];
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease, delay: Math.min(index * 0.03, 0.2) }}
      className="relative pl-7 pb-3 last:pb-0"
    >
      <span
        aria-hidden="true"
        className={`absolute left-[3px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-deep-space ${dotClass}`}
      />
      <p className="text-body text-polar-white">{row.headline}</p>
      {row.body && (
        <p className="mt-0.5 line-clamp-2 text-caption text-ash-gray">
          {row.body}
        </p>
      )}
    </motion.li>
  );
}

function GapRow({ amount, index }: { amount: string; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28, ease, delay: Math.min(index * 0.03, 0.2) }}
      className="relative pl-7 pb-3"
    >
      <span
        aria-hidden="true"
        className="absolute left-[3px] top-1.5 h-2.5 w-2.5 rounded-full bg-iron ring-2 ring-deep-space"
      />
      <p className="text-caption text-ash-gray">{amount} apart.</p>
    </motion.li>
  );
}

function Pending({ role }: { role: AgentRole }) {
  const tone = role === "aria" ? "text-aria" : "text-atlas";
  const dot = role === "aria" ? "bg-aria" : "bg-atlas";
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease }}
      className="relative pl-7"
    >
      <span
        aria-hidden="true"
        className={`absolute left-[3px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-deep-space pacta-pulse ${dot}`}
      />
      <p className="text-body">
        <span className={tone}>{role}</span>{" "}
        <span className="text-ash-gray">is thinking…</span>
      </p>
      <div className="mt-1.5 flex h-1 max-w-[200px] gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            className="h-1 flex-1 rounded-full bg-iron"
            animate={{ opacity: [0.25, 0.75, 0.25] }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
    </motion.li>
  );
}

const TONE_DOT: Record<Tone, string> = {
  aria: "bg-aria",
  atlas: "bg-atlas",
  tribunal: "bg-[#C084FC]",
  neutral: "bg-iron",
};

// ---------------------------------------------------------------------------
// Builder — turns the protocol history into a feed of plain-English events.
// ---------------------------------------------------------------------------

function buildRows(d: DisputeDump): Row[] {
  const rows: Row[] = [];
  let ariaOpened = false;
  let atlasOpened = false;
  let lastAriaNumber: number | null = null;
  let lastAtlasNumber: number | null = null;
  let gapEmittedFor: string | null = null;

  for (const m of d.history) {
    const role: AgentRole =
      m.from_agent === d.agents.aria ? "aria" : "atlas";

    if (m.type === "Propose" || m.type === "CounterPropose") {
      const offer = extractOffer((m as DumpProposeMsg).payload.state);
      const headline = phraseProposal({
        role,
        type: m.type,
        offer,
        firstFromRole: role === "aria" ? !ariaOpened : !atlasOpened,
      });
      rows.push({
        kind: "move",
        tone: role,
        headline,
        body: snippet((m as DumpProposeMsg).payload.rationale),
      });
      if (role === "aria") ariaOpened = true;
      else atlasOpened = true;
      if (offer.numeric !== null) {
        if (role === "aria") lastAriaNumber = offer.numeric;
        else lastAtlasNumber = offer.numeric;
      }

      // Once both sides have priced, surface the gap once per gap-state.
      if (lastAriaNumber !== null && lastAtlasNumber !== null) {
        const gapAmount = Math.abs(lastAriaNumber - lastAtlasNumber);
        if (gapAmount > 0) {
          const gapKey = `${lastAriaNumber}-${lastAtlasNumber}`;
          if (gapKey !== gapEmittedFor) {
            rows.push({ kind: "gap", amount: formatCurrency(gapAmount) });
            gapEmittedFor = gapKey;
          }
        }
      }
      continue;
    }

    if (m.type === "Critique") {
      rows.push({
        kind: "move",
        tone: role,
        headline: `${cap(role)} pushed back.`,
        body: snippet(
          "rationale" in m.payload ? String(m.payload.rationale) : null,
        ),
      });
      continue;
    }

    if (m.type === "Reveal") {
      rows.push({
        kind: "move",
        tone: role,
        headline: `${cap(role)} disclosed something binding.`,
        body: snippet(
          "information" in m.payload ? String(m.payload.information) : null,
        ),
      });
      continue;
    }

    if (m.type === "Accept") {
      rows.push({
        kind: "move",
        tone: role,
        headline: `${cap(role)} agreed.`,
        body: null,
      });
      continue;
    }

    if (m.type === "Escalate") {
      rows.push({
        kind: "move",
        tone: role,
        headline: `${cap(role)} escalated to the tribunal.`,
        body: snippet(
          "reason" in m.payload ? String(m.payload.reason) : null,
        ),
      });
      continue;
    }

    if (m.type === "Withdraw") {
      rows.push({
        kind: "move",
        tone: role,
        headline: `${cap(role)} walked away.`,
        body: snippet(
          "reason" in m.payload ? String(m.payload.reason) : null,
        ),
      });
    }
  }

  // Final outcome row.
  if (d.finalized) {
    rows.push(outcomeRow(d.finalized.outcome));
  }

  return rows;
}

function outcomeRow(o: Bundle["outcome"]): Row {
  if (o.kind === "converged") {
    const offer = extractOffer(o.final_state);
    return {
      kind: "outcome",
      tone: "neutral",
      headline: offer.numeric !== null
        ? `Settled at ${offer.formatted}.`
        : "Settled.",
      body: offer.terms,
    };
  }
  if (o.kind === "ruling") {
    const offer = extractOffer(o.ruling.remedy);
    const phrase = RULING_PHRASE[o.ruling.outcome];
    return {
      kind: "outcome",
      tone: "tribunal",
      headline: offer.numeric !== null
        ? `Tribunal ruled ${offer.formatted} — ${phrase}.`
        : `Tribunal ruled ${phrase}.`,
      body: offer.terms,
    };
  }
  if (o.kind === "withdrawn") {
    return {
      kind: "outcome",
      tone: o.withdrawn_role,
      headline: `${cap(o.withdrawn_role)} walked away.`,
      body: snippet(o.reason),
    };
  }
  return {
    kind: "outcome",
    tone: "neutral",
    headline: "No agreement reached.",
    body: null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Offer = { numeric: number | null; formatted: string; terms: string | null };

function extractOffer(state: unknown): Offer {
  const tiers = readStateTiers(state);
  let numeric: number | null = null;
  let formatted = "·";
  let terms: string | null = null;
  for (const [k, v] of tiers) {
    if (typeof v === "number" && v !== 0 && numeric === null) {
      numeric = v;
      formatted = k === "credit_usd" ? formatCurrency(v) : v.toLocaleString();
    } else if (typeof v === "string" && v.trim() && terms === null) {
      terms = v.length > 110 ? `${v.slice(0, 110).trim()}…` : v;
    }
  }
  if (numeric === null && terms !== null) {
    formatted = terms.length > 36 ? `${terms.slice(0, 36).trim()}…` : terms;
    terms = null;
  }
  return { numeric, formatted, terms };
}

function phraseProposal(args: {
  role: AgentRole;
  type: "Propose" | "CounterPropose";
  offer: Offer;
  firstFromRole: boolean;
}): string {
  const verb =
    args.type === "Propose"
      ? args.firstFromRole
        ? "opened"
        : "proposed"
      : "countered";
  return `${cap(args.role)} ${verb} ${args.offer.formatted}.`;
}

function snippet(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > 140 ? `${t.slice(0, 140).trim()}…` : t;
}

function formatCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `$${n.toLocaleString()}`;
  return `$${n}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
