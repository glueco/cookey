"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  RelativeTime,
  Section,
  Sparkline,
  StatTile,
} from "@/components/ui";

// ============================================
// OVERVIEW — the "is everything fine?" screen
// Answers, in order: does anything need me (pending grants), what is
// this costing me, who is using it, and is anything being refused.
// ============================================

interface Stats {
  requestsToday: number;
  deniedToday: number;
  estSpendToday: number;
  estSpend30d: number;
  activeGrants: number;
  pendingGrants: number;
  trend: Array<{ date: string; requests: number; denied: number; spend: number }>;
  topApps: Array<{ appId: string; name: string; requests: number }>;
  recentActivity: Array<{
    id: string;
    resourceId: string;
    action: string;
    decision: string;
    latencyMs: number | null;
    timestamp: string;
    app: { name: string } | null;
  }>;
}

const currency = (value: number) =>
  value >= 1000
    ? `$${(value / 1000).toFixed(1)}k`
    : `$${value.toFixed(value < 10 ? 2 : 0)}`;

export default function OverviewPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.get<Stats>("/api/admin/stats"),
    refetchInterval: 30_000,
  });

  if (error) {
    return (
      <main className="p-8 space-y-6 max-w-5xl">
        <PageHeader title="Overview" />
        <ErrorState
          message={`Couldn't load the overview: ${
            error instanceof Error ? error.message : "unknown error"
          }`}
          onRetry={() => refetch()}
        />
      </main>
    );
  }

  if (isLoading || !data) {
    return (
      <main className="p-8 space-y-6 max-w-5xl">
        <PageHeader title="Overview" />
        <div className="card p-5">
          <LoadingRows rows={4} />
        </div>
      </main>
    );
  }

  const trend = data.trend ?? [];
  const requestSeries = trend.map((day) => day.requests);
  const spendSeries = trend.map((day) => day.spend);
  // An all-zero series draws a flat line, which reads as a broken chart
  // rather than as "nothing happened" — omit the sparkline entirely.
  const hasRequests = requestSeries.some((value) => value > 0);
  const hasSpend = spendSeries.some((value) => value > 0);
  const denialRate =
    data.requestsToday > 0
      ? Math.round((data.deniedToday / data.requestsToday) * 100)
      : 0;

  return (
    <main className="p-8 space-y-6 max-w-5xl animate-fade-in">
      <PageHeader
        title="Overview"
        description="Everything your gateway did over the last fourteen days."
      />

      {data.pendingGrants > 0 && (
        <Link
          href="/grants?status=PENDING"
          /* "Waiting on you" is a STATUS, not a brand moment — amber, so
             it keeps its urgency whatever the accent is re-toned to. */
          className="group flex items-center gap-3 p-4 rounded-xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 hover:bg-amber-100/60 dark:hover:bg-amber-500/15 transition-colors"
        >
          <span className="relative flex w-2.5 h-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60" />
            <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-amber-500" />
          </span>
          <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {data.pendingGrants} app{data.pendingGrants > 1 ? "s are" : " is"}{" "}
            waiting for your decision
          </span>
          <svg
            className="w-4 h-4 ml-auto text-primary-600 dark:text-primary-400 transition-transform group-hover:translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      )}

      <div className="card grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-200 dark:divide-slate-800 overflow-hidden">
        <StatTile
          label="Requests today"
          value={data.requestsToday.toLocaleString()}
          hint={
            data.deniedToday > 0
              ? `${data.deniedToday.toLocaleString()} refused · ${denialRate}%`
              : "none refused"
          }
          trend={hasRequests ? requestSeries : undefined}
        />
        <StatTile
          label="Spend today"
          value={currency(data.estSpendToday)}
          hint={`${currency(data.estSpend30d)} last 30 days`}
          trend={hasSpend ? spendSeries : undefined}
        />
        <StatTile
          label="Active grants"
          value={data.activeGrants.toLocaleString()}
          hint={
            data.pendingGrants > 0
              ? `${data.pendingGrants} pending review`
              : "all reviewed"
          }
          href="/grants"
        />
        <StatTile
          label="Busiest app · 7d"
          value={data.topApps[0]?.name ?? "—"}
          hint={
            data.topApps[0]
              ? `${data.topApps[0].requests.toLocaleString()} requests`
              : "no traffic yet"
          }
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <Section
          title="Busiest apps"
          description="Last 7 days"
          padded={false}
          actions={
            <Link href="/grants" className="btn-ghost btn-sm">
              All grants
            </Link>
          }
        >
          {data.topApps.length === 0 ? (
            <p className="px-5 py-6 field-hint">
              No traffic yet — approve a grant and the first requests show up
              here.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {data.topApps.map((app) => {
                const share = data.topApps[0].requests || 1;
                return (
                  <li key={app.appId} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-700 dark:text-slate-200 truncate">
                        {app.name}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                        {app.requests.toLocaleString()}
                      </span>
                    </div>
                    {/* Bar-per-row beats a pie: comparison is the whole
                        point, and the eye reads length far better than angle. */}
                    <div className="h-1 mt-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary-600/70 dark:bg-primary-500/70"
                        style={{
                          width: `${Math.max(3, (app.requests / share) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section
          title="Recent activity"
          padded={false}
          actions={
            <Link href="/logs" className="btn-ghost btn-sm">
              All logs
            </Link>
          }
        >
          {data.recentActivity.length === 0 ? (
            <p className="px-5 py-6 field-hint">Nothing has come through yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {data.recentActivity.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center gap-2.5 px-5 py-2 text-xs"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      log.decision === "ALLOWED"
                        ? "bg-emerald-500"
                        : log.decision === "ERROR"
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    }`}
                    title={log.decision.toLowerCase().replace(/_/g, " ")}
                  />
                  <span className="text-slate-700 dark:text-slate-200 truncate">
                    <span className="font-medium">
                      {log.app?.name ?? "unknown app"}
                    </span>
                    <span className="text-slate-400"> → </span>
                    <span className="font-mono">{log.resourceId}</span>
                  </span>
                  <RelativeTime
                    value={log.timestamp}
                    className="text-slate-400 ml-auto shrink-0 tabular-nums"
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {hasRequests ? (
        <Section
          title="Traffic"
          description="Requests per day, last 14 days"
        >
          <TrafficChart trend={trend} />
        </Section>
      ) : (
        <EmptyState
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          }
          title="No traffic in the last two weeks"
          description="Once an approved app starts making requests, its volume, spend and refusals appear here."
          action={
            <Link href="/grants/new" className="btn-primary">
              Connect an app
            </Link>
          }
        />
      )}
    </main>
  );
}

/**
 * Daily volume with refusals stacked on top. Bars, not a line: the
 * series is discrete days, and a stacked bar makes "how much of today
 * was refused" readable at a glance.
 */
function TrafficChart({ trend }: { trend: Stats["trend"] }) {
  const peak = Math.max(1, ...trend.map((day) => day.requests));

  return (
    <div>
      {/* h-full on each column is load-bearing: the bars size in percent,
          and a percentage height only resolves against a definite one. */}
      <div className="flex items-end gap-1 h-28 border-b border-slate-200 dark:border-slate-800">
        {trend.map((day) => {
          const allowed = day.requests - day.denied;
          const label = `${new Date(day.date).toLocaleDateString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}: ${day.requests.toLocaleString()} requests${
            day.denied > 0 ? `, ${day.denied.toLocaleString()} refused` : ""
          }`;
          return (
            <div
              key={day.date}
              className="flex-1 h-full flex flex-col justify-end group relative"
              title={label}
            >
              {day.denied > 0 && (
                <div
                  className="shrink-0 rounded-t-sm bg-rose-500/80"
                  style={{
                    height: `${(day.denied / peak) * 100}%`,
                    minHeight: "2px",
                  }}
                />
              )}
              {allowed > 0 && (
                <div
                  className={`shrink-0 bg-primary-600/80 dark:bg-primary-500/80 group-hover:bg-primary-600 dark:group-hover:bg-primary-500 transition-colors ${
                    day.denied > 0 ? "" : "rounded-t-sm"
                  }`}
                  style={{
                    height: `${(allowed / peak) * 100}%`,
                    minHeight: "2px",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-[11px] text-slate-400">
        <span>
          {new Date(trend[0]?.date ?? Date.now()).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          })}
        </span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-primary-600/80 dark:bg-primary-500/80" />
            allowed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-rose-500/80" />
            refused
          </span>
        </span>
        <span>Today</span>
      </div>
    </div>
  );
}
