"use client";

import { motion } from "framer-motion";
import type { SignedMessage } from "../../src/types";

export type TranscriptEntry = {
  round: number;
  role: "aria" | "atlas" | "tribunal";
  signed: SignedMessage;
  hash: string;
};

const ROLE_TINT: Record<TranscriptEntry["role"], string> = {
  aria: "text-amber-glow",
  atlas: "text-slate",
  tribunal: "text-neon-green",
};

const ROLE_BG: Record<TranscriptEntry["role"], string> = {
  aria: "border-l-amber-glow/60",
  atlas: "border-l-slate/60",
  tribunal: "border-l-neon-green/60",
};

function shortHash(h: string) {
  return h.length > 18 ? `${h.slice(0, 14)}…${h.slice(-2)}` : h;
}

function shortDid(d: string) {
  return d.length > 30 ? `${d.slice(0, 15)}…${d.slice(-6)}` : d;
}

function MessageBody({ signed }: { signed: SignedMessage }) {
  const m = signed;
  if (m.type === "Propose" || m.type === "CounterPropose") {
    return (
      <div className="mt-2 grid gap-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-input text-caption text-ash-gray">
          <span>
            credit_usd:{" "}
            <span className="text-neon-green">
              ${m.payload.state.credit_usd.toLocaleString()}
            </span>
          </span>
          <span>
            utility_for_self:{" "}
            <span className="text-polar-white">
              {m.payload.utility_for_self.toFixed(2)}
            </span>
          </span>
          <span>
            evidence_refs:{" "}
            <span className="text-polar-white">{m.evidence_refs.length}</span>
          </span>
        </div>
        <p className="text-[14px] leading-[1.55] text-ash-gray">
          <span className="text-polar-white">terms — </span>
          {m.payload.state.terms}
        </p>
        {m.payload.rationale ? (
          <p className="text-[14px] leading-[1.55] text-ash-gray italic">
            “{m.payload.rationale}”
          </p>
        ) : null}
      </div>
    );
  }
  if (m.type === "Critique") {
    return (
      <div className="mt-2 grid gap-2">
        <span className="font-input text-caption text-ash-gray">
          target · <span className="text-polar-white">{shortHash(m.payload.target_msg_hash)}</span>
        </span>
        <p className="text-[14px] leading-[1.55] text-ash-gray italic">
          “{m.payload.rationale}”
        </p>
      </div>
    );
  }
  if (m.type === "Reveal") {
    return (
      <div className="mt-2 grid gap-2">
        <span className="font-input text-caption text-amber-glow">
          domain · {m.payload.domain}
        </span>
        <p className="text-[14px] leading-[1.55] text-polar-white">
          {m.payload.information}
        </p>
      </div>
    );
  }
  if (m.type === "Accept") {
    return (
      <p className="mt-2 font-input text-caption text-ash-gray">
        accepts · <span className="text-neon-green">{shortHash(m.payload.target_msg_hash)}</span>
      </p>
    );
  }
  if (m.type === "Escalate") {
    return (
      <p className="mt-2 font-input text-caption text-ash-gray">
        reason · <span className="text-polar-white">{m.payload.reason}</span> →{" "}
        <span className="text-amber-glow">{m.payload.requested_action}</span>
      </p>
    );
  }
  return null;
}

const cardSpring = { type: "spring", stiffness: 140, damping: 22 } as const;

export function Transcript({ entries }: { entries: TranscriptEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="space-y-3" aria-live="polite">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-lg border border-dark-carbon bg-deep-space pacta-shimmer"
          />
        ))}
        <p className="font-input text-caption text-ash-gray">
          waiting for first round…
        </p>
      </div>
    );
  }

  let lastRound = -1;
  return (
    <ol className="space-y-3" aria-label="Negotiation transcript">
      {entries.map((entry, i) => {
        const m = entry.signed;
        const roundChanged = entry.round !== lastRound;
        lastRound = entry.round;
        return (
          <motion.li
            key={`${entry.hash}-${i}`}
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={cardSpring}
          >
            {roundChanged ? (
              <div className="mb-2 flex items-center gap-3">
                <span className="font-input text-caption uppercase tracking-tight text-ash-gray">
                  round · <span className="text-polar-white">{String(entry.round).padStart(2, "0")}</span>
                </span>
                <span className="h-px flex-1 bg-dark-carbon/60" />
              </div>
            ) : null}
            <article
              className={[
                "rounded-lg border border-dark-carbon bg-deep-space p-5 border-l-4",
                ROLE_BG[entry.role],
              ].join(" ")}
            >
              <header className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span
                    className={[
                      "font-aeonik text-heading-sm font-bold",
                      ROLE_TINT[entry.role],
                    ].join(" ")}
                  >
                    {entry.role}
                  </span>
                  <span className="font-input text-caption text-ash-gray">
                    {m.type}
                  </span>
                </div>
                <div className="font-input text-caption text-ash-gray">
                  <span className="text-polar-white">Ed25519 ✓</span>{" "}
                  · {shortHash(entry.hash)}
                </div>
              </header>
              <p className="mt-1 font-input text-caption text-dark-carbon">
                {shortDid(m.from_agent)}
              </p>
              <MessageBody signed={m} />
            </article>
          </motion.li>
        );
      })}
    </ol>
  );
}
