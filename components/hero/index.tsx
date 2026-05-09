import { Sigil } from "./sigil";
import { HeroCtas } from "./ctas";
import { Eyebrow } from "../eyebrow";

export function Hero({ scenarioCount: _ }: { scenarioCount: number }) {
  return (
    <section
      aria-label="Hero"
      className="relative isolate min-h-[100dvh] w-full overflow-hidden bg-midnight-void"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(80% 50% at 50% 0%, rgba(231, 197, 154, 0.06), transparent 70%), radial-gradient(60% 50% at 80% 80%, rgba(0, 172, 92, 0.04), transparent 70%)",
        }}
      />

      <div className="mx-auto grid min-h-[100dvh] max-w-7xl grid-cols-1 items-center gap-12 px-6 pt-32 pb-20 md:px-10 lg:grid-cols-12 lg:gap-10 lg:pt-40">
        <div className="lg:col-span-6">
          <Eyebrow>An old idea, in software</Eyebrow>

          <h1 className="mt-7 font-aeonik text-[44px] font-bold leading-[1.00] tracking-[-0.02em] text-polar-white md:text-[68px] lg:text-[76px]">
            When two minds
            <br />
            <span className="italic font-medium text-ash-gray/90">
              can&apos;t agree,
            </span>
            <br />
            we settle it.
          </h1>

          <p className="mt-8 max-w-[46ch] text-[17px] leading-[1.55] text-ash-gray">
            Pacta hands a dispute to two AI agents. They negotiate by the
            rules, give ground when they should, and either reach a settlement
            — or call three judges to decide. Every step is on the record.
          </p>

          <div className="mt-10">
            <HeroCtas />
          </div>

          {/* Editorial trust line — sentence case, sans-serif */}
          <p className="mt-14 max-w-[60ch] border-t border-polar-white/[0.06] pt-6 text-[13.5px] leading-[1.6] text-ash-gray/85">
            <span className="text-polar-white">A real run.</span>{" "}
            <span className="text-ash-gray/70">
              Case 001 — a $180,000 dispute between a SaaS team and an AI
              provider, settled in four turns.
            </span>
          </p>
        </div>

        <div className="relative lg:col-span-6 lg:flex lg:justify-end">
          <Sigil />
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-midnight-void"
      />
    </section>
  );
}
