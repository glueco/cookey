"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

// ============================================
// OVERVIEW — stat tiles, pending grants CTA, top apps, recent activity
// ============================================

interface Stats {
  requestsToday: number;
  estSpendToday: number;
  estSpend30d: number;
  activeGrants: number;
  pendingGrants: number;
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

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card card-hover p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="text-[26px] font-bold tracking-tight tabular-nums text-slate-900 dark:text-white mt-1.5 truncate">
        {value}
      </p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function OverviewPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.get<Stats>("/api/admin/stats"),
    refetchInterval: 30_000,
  });

  if (error) {
    return (
      <main className="p-8 space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">
          Couldn’t load overview: {error instanceof Error ? error.message : "unknown error"}
        </p>
        <button className="btn-secondary text-sm" onClick={() => refetch()}>
          Retry
        </button>
      </main>
    );
  }

  if (isLoading || !data) {
    return <main className="p-6 text-slate-500">Loading…</main>;
  }

  return (
    <main className="p-8 space-y-6 max-w-5xl animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Overview
      </h1>

      {data.pendingGrants > 0 && (
        <Link
          href="/grants?status=PENDING"
          className="flex items-center gap-3 p-4 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 text-sm font-medium text-primary-800 dark:text-primary-300 hover:bg-primary-100/70 dark:hover:bg-primary-900/30 transition-colors"
        >
          <span className="relative flex w-2.5 h-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-500 opacity-60" />
            <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-primary-500" />
          </span>
          {data.pendingGrants} grant request{data.pendingGrants > 1 ? "s" : ""} waiting
          for your review →
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Requests today" value={String(data.requestsToday)} />
        <StatTile
          label="Est. spend today"
          value={`$${data.estSpendToday.toFixed(2)}`}
          hint={`$${data.estSpend30d.toFixed(2)} last 30 days`}
        />
        <StatTile label="Active grants" value={String(data.activeGrants)} />
        <StatTile
          label="Top app (7d)"
          value={data.topApps[0]?.name ?? "—"}
          hint={data.topApps[0] ? `${data.topApps[0].requests} requests` : undefined}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-5">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white mb-3">
            Top apps (7 days)
          </h2>
          {data.topApps.length === 0 ? (
            <p className="text-sm text-slate-500">No traffic yet.</p>
          ) : (
            <ul className="space-y-1">
              {data.topApps.map((app) => (
                <li key={app.appId} className="flex justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-200">{app.name}</span>
                  <span className="text-slate-400">{app.requests}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white mb-3">
            Recent activity
          </h2>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.recentActivity.map((log) => (
                <li key={log.id} className="text-xs flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      log.decision === "ALLOWED" ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                  <span className="text-slate-700 dark:text-slate-200 truncate">
                    {log.app?.name ?? "?"} → {log.resourceId} {log.action}
                  </span>
                  <span className="text-slate-400 ml-auto shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
