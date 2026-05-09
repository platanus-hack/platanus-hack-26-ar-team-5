import { ScenarioCard, type ScenarioCardData } from "./scenario-card";
import { Eyebrow } from "./eyebrow";

const CASES: ScenarioCardData[] = [
  {
    id: "ai-overrun",
    index: 0,
    framing: "A $180k AI bill, after a silent regression.",
    partyA: "Aria · FinOps",
    partyB: "Atlas · AI Provider",
    body: "A SaaS company says a model update broke their evals and ran the bill up. The provider says the SLA only covers uptime. Both can prove parts of their case.",
    metric: "$180k",
    metricLabel: "in dispute",
    outcome: "Settled in four turns.",
    accent: "amber",
    span: "lg:col-span-7",
  },
  {
    id: "oncology",
    index: 1,
    framing: "An immunotherapy plan, a hospital, and an insurer.",
    partyA: "Aurora · Hospital",
    partyB: "Cobra · Insurer",
    body: "Stage IIIB lung cancer. The hospital wants upfront durvalumab; the insurer wants consolidation only. Lives, not dollars, drive the bound.",
    metric: "Stage IIIB",
    metricLabel: "NSCLC authorization",
    outcome: "Settled with stopping rules.",
    accent: "rose",
    span: "lg:col-span-5",
  },
  {
    id: "cve-disclosure",
    index: 2,
    framing: "A 7-day window, and an expired support contract.",
    partyA: "Hedge · OSS",
    partyB: "Bastion · Enterprise",
    body: "An open-source maintainer found a high-severity CVE. A corporate user wants two weeks of notice. The agreement that bound them lapsed last month.",
    metric: "7 days",
    metricLabel: "until disclosure",
    outcome: "Renewed and re-scoped.",
    accent: "green",
    span: "lg:col-span-5",
  },
  {
    id: "creative-brief",
    index: 3,
    framing: "Five hero images, one vague brief, $12k owed.",
    partyA: "Lyra · Marketer",
    partyB: "Sigma · Studio",
    body: "Marketing says the work doesn't fit the brand. The studio says the brief was met. Most of the evidence is taste, not invoices — exactly the hard case.",
    metric: "$12k",
    metricLabel: "scope of work",
    outcome: "Bounded revisions, partial pay.",
    accent: "white",
    span: "lg:col-span-7",
  },
  {
    id: "post-mortem",
    index: 4,
    framing: "An outage, a deadline, and the words that go in the report.",
    partyA: "Stitcher · webhooks",
    partyB: "Lumea · analytics",
    body: "Two infra companies share 340 enterprise customers. After a 4-hour cascade, both publicly promised a joint post-mortem. No dollars in play — only the wording, the root-cause framing, and the commitments each side makes for next time.",
    metric: "14 days",
    metricLabel: "advance notice on key rotation",
    outcome: "Notice + key pre-publication, shared cause.",
    accent: "green",
    span: "lg:col-span-12",
  },
];

export function ScenariosGrid() {
  return (
    <section
      id="cases"
      aria-labelledby="cases-heading"
      className="relative mx-auto w-full max-w-7xl px-6 py-32 md:px-10 md:py-40"
    >
      <div className="mx-auto max-w-3xl text-center">
        <div className="flex justify-center">
          <Eyebrow>Five cases</Eyebrow>
        </div>
        <h2
          id="cases-heading"
          className="mt-5 font-aeonik text-[40px] font-bold leading-[1.02] tracking-[-0.02em] text-polar-white md:text-[56px]"
        >
          Real disputes,
          <br />
          <span className="italic font-medium text-ash-gray/85">
            settled by software.
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-[55ch] text-[16px] leading-[1.6] text-ash-gray">
          Each case is a small library of evidence and a real conflict of
          interest. Open one — Pacta will run both sides and let you watch them
          land.
        </p>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {CASES.map((c) => (
          <ScenarioCard key={c.id} {...c} />
        ))}
      </div>
    </section>
  );
}
