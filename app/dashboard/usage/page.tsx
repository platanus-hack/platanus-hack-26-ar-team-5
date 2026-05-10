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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="t-display text-polar-white">Usage</h1>
        <p className="t-label max-w-xl text-ash-gray">
          Monthly quotas, totals, per-endpoint volume and the most recent
          instrumented requests for your account.
        </p>
      </header>
      <UsageCharts data={summary} />
    </main>
  );
}
