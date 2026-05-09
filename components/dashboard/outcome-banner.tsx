"use client";

import type { DisputeDump } from "./types";
import { shortHash } from "./format";

type Props = {
  dispute: DisputeDump;
};

export function OutcomeBanner({ dispute }: Props) {
  if (!dispute.finalized) return null;
  const outcome = dispute.finalized.outcome;
  if (outcome.kind === "converged") {
    return <ConvergedBanner dispute={dispute} state={outcome.final_state} />;
  }
  if (outcome.kind === "ruling") {
    return <RuledBanner dispute={dispute} />;
  }
  return <DeadlineBanner dispute={dispute} />;
}

function ConvergedBanner({
  dispute,
  state,
}: {
  dispute: DisputeDump;
  state: { domain: string; tiers: Record<string, unknown> };
}) {
  const tiers = Object.entries(state.tiers ?? {});
  return (
    <section className="overflow-hidden rounded-lg border border-amber-glow/30 bg-graphite/60">
      <div className="flex items-center gap-2 border-b border-amber-glow/20 bg-amber-glow/5 px-4 py-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-glow" />
        <span className="text-micro uppercase tracking-[0.22em] text-amber-glow">
          Converged · settled
        </span>
        <span className="ml-auto font-mono text-micro text-dim">
          domain · {state.domain}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-px bg-line/40 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map(([k, v]) => (
          <div key={k} className="bg-graphite/60 px-5 py-4">
            <div className="text-micro uppercase tracking-[0.18em] text-ash-gray">
              {k}
            </div>
            <div className="mt-1 font-mono text-stat text-polar-white tabular">
              {String(v)}
            </div>
          </div>
        ))}
      </div>
      <BundleFooter dispute={dispute} />
    </section>
  );
}

function RuledBanner({ dispute }: { dispute: DisputeDump }) {
  return (
    <section className="overflow-hidden rounded-lg border border-atlas/30 bg-graphite/60">
      <div className="flex items-center gap-2 border-b border-atlas/20 bg-atlas/5 px-4 py-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-atlas" />
        <span className="text-micro uppercase tracking-[0.22em] text-atlas">
          Tribunal ruling
        </span>
      </div>
      <div className="px-5 py-4">
        <p className="text-caption text-bone">
          Negotiation deadlocked or escalated. The Tribunal jury delivered a
          ruling — see audit trail for the signed votes and final ruling
          payload.
        </p>
      </div>
      <BundleFooter dispute={dispute} />
    </section>
  );
}

function DeadlineBanner({ dispute }: { dispute: DisputeDump }) {
  return (
    <section className="overflow-hidden rounded-lg border border-warn-red/30 bg-graphite/60">
      <div className="flex items-center gap-2 border-b border-warn-red/20 bg-warn-red/5 px-4 py-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-warn-red" />
        <span className="text-micro uppercase tracking-[0.22em] text-warn-red">
          Deadline reached · no agreement
        </span>
      </div>
      <BundleFooter dispute={dispute} />
    </section>
  );
}

function BundleFooter({ dispute }: { dispute: DisputeDump }) {
  if (!dispute.finalized) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line/50 bg-graphite/40 px-5 py-3 text-micro text-dim">
      <span className="text-ash-gray">root_hash</span>
      <span className="font-mono text-bone">
        sha256:{shortHash(dispute.finalized.root_hash, 24)}…
      </span>
      <span className="ml-auto font-mono">
        {dispute.finalized.evidence.length} evd · {dispute.finalized.messages.length} msg
      </span>
    </div>
  );
}
