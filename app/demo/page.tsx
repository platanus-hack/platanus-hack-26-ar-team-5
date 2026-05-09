import Link from "next/link";
import { listScenarios } from "../../src/scenarios/index";
import { DemoStream } from "../../components/demo/demo-stream";
import { Footer } from "../../components/footer";

export const metadata = {
  title: "Pacta — Demo",
};

type SearchParams = Promise<{ scenario?: string }>;

export default async function DemoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const scenarios = listScenarios();
  const ids = new Set(scenarios.map((s) => s.id));
  const initialScenario =
    sp.scenario && ids.has(sp.scenario) ? sp.scenario : scenarios[0]!.id;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4 md:pt-6">
        <div className="flex w-full max-w-[760px] items-center justify-between gap-6 rounded-full border border-polar-white/10 bg-midnight-void/70 px-3 py-2 backdrop-blur-xl">
          <Link
            href="/"
            className="ml-2 inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-polar-white"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-amber-glow" />
            Pacta
          </Link>
          <span className="hidden text-[12.5px] italic text-ash-gray/70 md:inline">
            Live case · pick a scenario
          </span>
          <Link
            href="/"
            className="rounded-full px-4 py-1.5 text-[13px] text-ash-gray transition-colors hover:text-polar-white"
          >
            Close
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 pt-32 pb-20 md:px-10 md:pt-40">
        <DemoStream scenarios={scenarios} initialScenario={initialScenario} />
      </main>

      <Footer />
    </>
  );
}
