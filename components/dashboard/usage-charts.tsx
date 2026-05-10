"use client";

type UsageEvent = {
  id: number;
  user_id: string;
  api_key_id: string | null;
  endpoint: string;
  method: string;
  status: number;
  dispute_id: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  ts: string;
};

type UsageSummary = {
  window_start: string;
  window_end: string;
  totals: {
    requests: number;
    disputes_opened: number;
    messages_sent: number;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
  };
  by_endpoint: Array<{
    endpoint: string;
    requests: number;
    last_used_at: string | null;
  }>;
  quota: {
    disputes_used: number;
    disputes_limit: number;
    tokens_used: number;
    tokens_limit: number;
  };
  recent: UsageEvent[];
};

type Props = {
  data: UsageSummary;
};

export function UsageCharts({ data }: Props) {
  return (
    <div className="flex flex-col gap-12">
      <Quota quota={data.quota} />
      <Totals totals={data.totals} />
      <ByEndpoint rows={data.by_endpoint} />
      <RecentEvents rows={data.recent} />
    </div>
  );
}

function Quota({ quota }: { quota: UsageSummary["quota"] }) {
  return (
    <Section
      title="Monthly quota"
      subtitle="Resets at the start of each calendar month."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <QuotaRow
          label="Disputes opened"
          used={quota.disputes_used}
          limit={quota.disputes_limit}
        />
        <QuotaRow
          label="Tokens used"
          used={quota.tokens_used}
          limit={quota.tokens_limit}
        />
      </div>
    </Section>
  );
}

function QuotaRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const fill = pct >= 90 ? "bg-warn-red" : "bg-polar-white";
  return (
    <div className="rounded-lg border border-line/70 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-caption text-ash-gray">{label}</span>
        <span className="text-caption tabular text-bone">
          {used.toLocaleString()}
          <span className="text-dim"> / {limit.toLocaleString()}</span>
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-iron/60">
        <div
          className={`h-full ${fill} transition-[width]`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Totals({ totals }: { totals: UsageSummary["totals"] }) {
  const cost = Math.round(totals.cost_usd * 10_000) / 10_000;
  return (
    <Section title="Last 30 days" subtitle="Totals across all keys.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Requests" value={totals.requests.toLocaleString()} />
        <Stat
          label="Disputes opened"
          value={totals.disputes_opened.toLocaleString()}
        />
        <Stat
          label="Messages sent"
          value={totals.messages_sent.toLocaleString()}
        />
        <Stat label="Cost" value={`$${cost.toFixed(4)}`} />
      </div>
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/70 p-4">
      <p className="text-caption text-ash-gray">{label}</p>
      <p className="mt-2 text-[26px] font-medium leading-none tabular text-polar-white">
        {value}
      </p>
    </div>
  );
}

function ByEndpoint({ rows }: { rows: UsageSummary["by_endpoint"] }) {
  return (
    <Section
      title="By endpoint"
      subtitle="Sorted by request volume in the last 30 days."
    >
      <div className="overflow-hidden rounded-lg border border-line/70">
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-caption text-ash-gray">
            No requests yet.
          </p>
        ) : (
          <table className="w-full text-caption">
            <thead>
              <tr className="text-left text-caption text-ash-gray">
                <Th>Endpoint</Th>
                <Th className="text-right">Requests</Th>
                <Th className="text-right">Last used</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {rows.map((r) => (
                <tr key={r.endpoint} className="text-bone">
                  <Td>
                    <span className="font-mono text-polar-white">
                      {r.endpoint}
                    </span>
                  </Td>
                  <td className="px-4 py-2.5 text-right tabular text-polar-white">
                    {r.requests.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ash-gray tabular">
                    {r.last_used_at ? relativeTime(r.last_used_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Section>
  );
}

function RecentEvents({ rows }: { rows: UsageEvent[] }) {
  return (
    <Section title="Recent events" subtitle="Last 20 instrumented requests.">
      <div className="overflow-x-auto rounded-lg border border-line/70">
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-caption text-ash-gray">
            No events recorded yet.
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-caption">
            <thead>
              <tr className="text-left text-caption text-ash-gray">
                <Th>Time</Th>
                <Th>Request</Th>
                <Th className="text-right">Status</Th>
                <Th>Dispute</Th>
                <Th className="text-right">Tokens (in / out)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {rows.map((e) => (
                <tr key={e.id} className="text-bone">
                  <Td className="tabular text-ash-gray">
                    {formatTimeUtc(e.ts)}
                  </Td>
                  <Td>
                    <span className="text-ash-gray">{e.method}</span>{" "}
                    <span className="font-mono text-polar-white">
                      {e.endpoint}
                    </span>
                  </Td>
                  <td className={`px-4 py-2.5 text-right tabular ${statusColor(e.status)}`}>
                    {e.status}
                  </td>
                  <Td className="text-ash-gray">
                    {e.dispute_id ? (
                      <span className="font-mono">{shortId(e.dispute_id)}</span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <td className="px-4 py-2.5 text-right tabular text-polar-white">
                    {e.tokens_in.toLocaleString()}{" "}
                    <span className="text-dim">/</span>{" "}
                    {e.tokens_out.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Section>
  );
}

function statusColor(status: number): string {
  if (status >= 500) return "text-warn-red";
  if (status >= 400) return "text-amber-glow";
  return "text-pulse-green";
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-body font-medium text-polar-white">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-caption text-ash-gray">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 font-normal ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-2.5 ${className ?? ""}`}>{children}</td>;
}

function shortId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 8)}…`;
}

function formatTimeUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return iso;
  const diff = Date.now() - d;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
