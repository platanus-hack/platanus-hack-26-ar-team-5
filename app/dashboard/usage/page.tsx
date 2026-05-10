import { requireUser } from "../../../lib/auth/supabase-server";
import { getUserUsageSummary } from "../../../lib/auth/usage";
import { UsageCharts } from "../../../components/dashboard/usage-charts";

export const metadata = {
  title: "Pacta — Usage",
};

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const { profile } = await requireUser();
  const summary = await getUserUsageSummary(profile);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-medium leading-tight text-polar-white">
          Usage
        </h1>
        <p className="text-body text-ash-gray">
          Quotas, totals, and the most recent instrumented requests for your
          account.
        </p>
      </header>
      <UsageCharts data={summary} />
    </main>
  );
}
