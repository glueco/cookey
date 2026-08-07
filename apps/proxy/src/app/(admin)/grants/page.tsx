"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useGrants } from "@/hooks/useGrants";

// ============================================
// GRANTS LIST — app, status chip, auth type, expiry/period, last used
// ============================================

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  PENDING: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  EXPIRED: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  REVOKED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  DENIED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function statusStyle(status: string): string {
  if (status.startsWith("SUSPENDED")) {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  }
  return STATUS_STYLES[status] ?? STATUS_STYLES.EXPIRED;
}

function GrantsInner() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status") ?? undefined;
  const { data, isLoading, error, refetch } = useGrants(statusFilter);

  return (
    <main className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Grants{statusFilter ? ` — ${statusFilter.toLowerCase()}` : ""}
        </h1>
        <Link href="/grants/new" className="btn-primary text-sm">
          Add app
        </Link>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load grants: {error.message}
          </p>
          <button className="btn-secondary text-sm" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : !data?.grants.length ? (
        <p className="text-sm text-slate-500">
          No grants yet. <Link href="/grants/new" className="underline">Add an app</Link> to get started.
        </p>
      ) : (
        <div className="overflow-x-auto card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="p-3">App</th>
                <th className="p-3">Status</th>
                <th className="p-3">Auth</th>
                <th className="p-3">Expiry / period</th>
                <th className="p-3">Last used</th>
              </tr>
            </thead>
            <tbody>
              {data.grants.map((grant) => (
                <tr
                  key={grant.id}
                  className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="p-3">
                    <Link href={`/grants/${grant.id}`} className="font-medium text-slate-900 dark:text-white hover:underline">
                      {grant.app?.name ?? grant.document.app?.name ?? "(unknown)"}
                    </Link>
                    <p className="text-xs text-slate-400">
                      {grant._count.permissions} permission{grant._count.permissions === 1 ? "" : "s"} · {grant.runtime}
                    </p>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle(grant.status)}`}>
                      {grant.status.toLowerCase().replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="p-3 text-xs font-mono text-slate-600 dark:text-slate-300">
                    {grant.authType === "POP" ? "PoP" : "bearer"}
                  </td>
                  <td className="p-3 text-xs text-slate-600 dark:text-slate-300">
                    {grant.currentPeriodEnd
                      ? `period → ${new Date(grant.currentPeriodEnd).toLocaleDateString()}`
                      : grant.expiresAt
                        ? new Date(grant.expiresAt).toLocaleDateString()
                        : "never"}
                  </td>
                  <td className="p-3 text-xs text-slate-600 dark:text-slate-300">
                    {grant.lastUsedAt
                      ? `${new Date(grant.lastUsedAt).toLocaleString()}${grant.lastUsedIp ? ` (${grant.lastUsedIp})` : ""}`
                      : "never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default function GrantsPage() {
  return (
    <Suspense>
      <GrantsInner />
    </Suspense>
  );
}
