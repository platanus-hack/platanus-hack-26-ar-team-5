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
    <div className="flex flex-col gap-8">
      <QuotaStrip quota={data.quota} />
      <Totals totals={data.totals} />
      <ByEndpoint rows={data.by_endpoint} />
      <RecentEvents rows={data.recent} />
    </div>
  );
}

function QuotaStrip({ quota }: { quota: UsageSummary["quota"] }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader
        title="Monthly quota"
        subtitle="Resets at the start of each calendar month (UTC)."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <QuotaBar
          label="Disputes opened"
          used={quota.disputes_used}
          limit={quota.disputes_limit}
          format={(n) => n.toLocaleString()}
        />
        <QuotaBar
          label="Tokens used"
          used={quota.tokens_used}
          limit={quota.tokens_limit}
          format={(n) => n.toLocaleString()}
        />
      </div>
    </section>
  );
}

function QuotaBar({
  label,
  used,
  limit,
  format,
}: {
  label: string;
  used: number;
  limit: number;
  format: (n: number) => string;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const fill = pct >= 90 ? "bg-warn-red" : "bg-amber-glow";
  return (
    <div className="rounded-lg border border-line/70 bg-graphite/40 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-micro uppercase tracking-[0.18em] text-ash-gray">
          {label}
        </span>
        <span className="font-mono text-caption tabular text-bone">
          {format(used)}
          <span className="text-dim"> / {format(limit)}</span>
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-pill border border-line/70 bg-graphite/40">
        <div
          className={`h-full ${fill} transition-[width]`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-micro tabular text-dim">
        {pct.toFixed(1)}% used
      </p>
    </div>
  );
}

function Totals({ totals }: { totals: UsageSummary["totals"] }) {
  const cost = Math.round(totals.cost_usd * 10_000) / 10_000;
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title="Last 30 days" subtitle="Totals across all keys." />
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
        <Stat
          label="Cost (USD)"
          value={`$${cost.toFixed(4)}`}
          accent="text-amber-glow"
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-line/70 bg-graphite/40 p-4">
      <p className="text-micro uppercase tracking-[0.18em] text-ash-gray">
        {label}
      </p>
      <p
        className={`mt-2 text-stat-lg tabular ${
          accent ?? "text-polar-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ByEndpoint({ rows }: { rows: UsageSummary["by_endpoint"] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="By endpoint"
        subtitle="Sorted by request volume in the last 30 days."
      />
      <div className="overflow-hidden rounded-lg border border-line/70 bg-graphite/40">
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-caption text-ash-gray">
            No requests yet.
          </p>
        ) : (
          <table className="w-full text-caption">
            <thead className="text-micro uppercase tracking-[0.14em] text-ash-gray">
              <tr>
                <Th>Endpoint</Th>
                <Th className="text-right">Requests</Th>
                <Th className="text-right pr-4">Last used</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {rows.map((r) => (
                <tr key={r.endpoint}>
                  <Td>
                    <span className="font-mono text-bone">{r.endpoint}</span>
                  </Td>
                  <td className="px-4 py-2.5 text-right font-mono tabular text-polar-white">
                    {r.requests.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ash-gray">
                    {r.last_used_at ? relativeTime(r.last_used_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function RecentEvents({ rows }: { rows: UsageEvent[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Recent events"
        subtitle="Last 20 instrumented requests."
      />
      <div className="overflow-x-auto rounded-lg border border-line/70 bg-graphite/40">
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-caption text-ash-gray">
            No events recorded yet.
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-caption">
            <thead className="text-micro uppercase tracking-[0.14em] text-ash-gray">
              <tr>
                <Th>Time</Th>
                <Th>Method · endpoint</Th>
                <Th className="text-right">Status</Th>
                <Th>Dispute</Th>
                <Th className="text-right pr-4">Tokens (in / out)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {rows.map((e) => (
                <tr key={e.id}>
                  <Td>
                    <span className="font-mono text-bone">
                      {formatTimeUtc(e.ts)}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-mono text-bone">
                      <span className="text-dim">{e.method}</span>{" "}
                      {e.endpoint}
                    </span>
                  </Td>
                  <td className="px-4 py-2.5 text-right">
                    <StatusBadge status={e.status} />
                  </td>
                  <Td>
                    <span className="font-mono text-ash-gray">
                      {e.dispute_id ? shortId(e.dispute_id) : "—"}
                    </span>
                  </Td>
                  <td className="px-4 py-2.5 text-right font-mono tabular text-polar-white">
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
    </section>
  );
}

function StatusBadge({ status }: { status: number }) {
  const tone =
    status >= 500
      ? "border-warn-red/40 bg-warn-red/10 text-warn-red"
      : status >= 400
        ? "border-amber-glow/40 bg-amber-glow/10 text-amber-glow"
        : "border-pulse-green/40 bg-pulse-green/10 text-pulse-green";
  return (
    <span
      className={`inline-flex items-center rounded-pill border px-2 py-0.5 font-mono text-micro tabular ${tone}`}
    >
      {status}
    </span>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h2 className="text-body uppercase tracking-[0.18em] text-bone">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-caption text-ash-gray">{subtitle}</p>
      )}
    </div>
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
      className={`px-4 py-2 text-left font-normal ${className ?? ""}`}
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
