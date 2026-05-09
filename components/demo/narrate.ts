import type { StreamEvent } from "../../src/pacta";
import type { SignedMessage } from "../../src/types";
import { type ScenarioMeta, formatStateValue } from "./scenario-meta";

export type Narration = {
  /** Headline of the move (8-12 words max). */
  headline: string;
  /** Optional one-line gloss with their reason. */
  detail?: string;
  /** Which party (or "tribunal") performed the move. */
  actor?: "aria" | "atlas" | "tribunal" | null;
  /** Verb or move type label (plain English). */
  move?: string;
};

const VERB_LABEL: Record<string, string> = {
  Propose: "opens with",
  CounterPropose: "counters",
  Critique: "pushes back",
  Reveal: "reveals",
  Accept: "accepts",
  Escalate: "calls a halt",
};

function partyName(actor: "aria" | "atlas", meta: ScenarioMeta) {
  return actor === "aria" ? meta.aria.name : meta.atlas.name;
}

export function narrate(
  ev: StreamEvent,
  meta: ScenarioMeta,
): Narration | null {
  switch (ev.kind) {
    case "scenario.selected":
      return { headline: meta.intro };
    case "agent.boot":
      return null;
    case "evidence.loaded":
      return {
        headline: `Evidence on file — ${ev.count} signed items.`,
        detail: "Each piece carries a tier from S (most authoritative) to C.",
      };
    case "round.start":
      return null; // round badge is rendered separately
    case "message.rejected":
      return {
        headline: `${partyName(ev.role as "aria" | "atlas", meta)}'s move was rejected.`,
        detail: ev.reason.length > 140 ? ev.reason.slice(0, 137) + "…" : ev.reason,
        actor: ev.role as "aria" | "atlas" | null,
        move: "rejected",
      };
    case "message.accepted": {
      const role = ev.role as "aria" | "atlas" | "tribunal";
      const m: SignedMessage = ev.signed;
      const name = role === "tribunal" ? "Tribunal" : partyName(role, meta);
      const verb = VERB_LABEL[m.type] ?? m.type;

      if (m.type === "Propose" || m.type === "CounterPropose") {
        const f = formatStateValue(meta.unit, m.payload.state.credit_usd);
        return {
          headline: `${name} ${verb} ${f.primary}.`,
          detail:
            m.payload.rationale && m.payload.rationale.length > 0
              ? truncate(m.payload.rationale, 180)
              : m.payload.state.terms,
          actor: role,
          move: m.type === "Propose" ? "Open" : "Counter",
        };
      }
      if (m.type === "Critique") {
        return {
          headline: `${name} pushes back.`,
          detail: m.payload.rationale ? truncate(m.payload.rationale, 200) : undefined,
          actor: role,
          move: "Push back",
        };
      }
      if (m.type === "Reveal") {
        return {
          headline: `${name} reveals new context.`,
          detail: truncate(m.payload.information, 200),
          actor: role,
          move: "Reveal",
        };
      }
      if (m.type === "Accept") {
        return {
          headline: `${name} accepts the offer on the table.`,
          actor: role,
          move: "Accept",
        };
      }
      if (m.type === "Escalate") {
        return {
          headline: `${name} calls for a halt.`,
          detail: m.payload.reason,
          actor: role,
          move: "Halt",
        };
      }
      return { headline: `${name} acted.`, actor: role };
    }
    case "convergence":
      return {
        headline: "Settled.",
        detail: ev.final_state.terms,
        move: "Settled",
      };
    case "deadline":
      return {
        headline: "Time ran out.",
        detail: "The agents could not converge before the deadline.",
        move: "Deadline",
      };
    case "deadlock":
      return {
        headline: "Stalemate detected.",
        detail: "Neither side moved enough across the last rounds.",
        move: "Stalemate",
      };
    case "escalation":
      return {
        headline: "The case goes to the bench.",
        detail: "Three judges will read the record and rule.",
        move: "Escalation",
      };
    case "jury.start":
      return {
        headline: "The bench convenes.",
        detail: "Aequitas, Utilis, and Velox each weigh the record.",
      };
    case "jury.vote":
      return {
        headline: `${ev.vote.juror} votes ${prettyOutcome(ev.vote.outcome)}.`,
        detail: ev.vote.rationale ? truncate(ev.vote.rationale, 200) : undefined,
        actor: "tribunal",
        move: ev.vote.juror,
      };
    case "jury.ruling":
      return {
        headline: `Ruling — ${prettyOutcome(ev.ruling.outcome)}.`,
        detail: ev.ruling.rationale ? truncate(ev.ruling.rationale, 220) : undefined,
        actor: "tribunal",
        move: "Ruling",
      };
    case "bundle":
      return null;
    default:
      return null;
  }
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function prettyOutcome(o: string) {
  return o.replace(/_/g, " ");
}
