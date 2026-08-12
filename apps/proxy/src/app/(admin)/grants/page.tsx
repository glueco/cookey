"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useGrants, type GrantSummary } from "@/hooks/useGrants";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  RelativeTime,
  useSlashFocus,
} from "@/components/ui";

// ============================================
// GRANTS LIST
// Filterable by state, searchable by app name. Pending grants sort to
// the top regardless of filter — an unanswered request is the only row
// here that needs the owner to do something.
// ============================================

const FILTERS = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "EXPIRED", label: "Expired" },
  { value: "REVOKED", label: "Revoked" },
] as const;

function statusBadge(status: string): string {
  if (status.startsWith("SUSPENDED")) return "badge-warning";
  switch (status) {
    case "ACTIVE":
      return "badge-success";
    case "PENDING":
      return "badge-info";
    case "REVOKED":
    case "DENIED":
      return "badge-danger";
    default:
      return "badge-neutral";
  }
}

function appName(grant: GrantSummary): string {
  return grant.app?.name ?? grant.document?.app?.name ?? "(unknown app)";
}

/** When does this grant lapse, in one phrase. */
function lifetime(grant: GrantSummary): {
  label: string;
  value: string | null;
} {
  if (grant.currentPeriodEnd) {
    return { label: "Period ends", value: grant.currentPeriodEnd };
  }
  if (grant.expiresAt) return { label: "Expires", value: grant.expiresAt };
  return { label: "Expires", value: null };
}

function GrantsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status") ?? "";
  const [search, setSearch] = useState("");
  const searchRef = useSlashFocus<HTMLInputElement>();

  // SUSPENDED covers three distinct DB states, so it can't be pushed
  // down to the API's exact-match filter — it's resolved client-side.
  const apiStatus = statusFilter === "SUSPENDED" ? undefined : statusFilter;
  const { data, isLoading, error, refetch } = useGrants(apiStatus || undefined);

  const grants = useMemo(() => {
    let rows = data?.grants ?? [];
    if (statusFilter === "SUSPENDED") {
      rows = rows.filter((grant) => grant.status.startsWith("SUSPENDED"));
    }
    const needle = search.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((grant) =>
        appName(grant).toLowerCase().includes(needle),
      );
    }
    // Anything awaiting a decision floats to the top.
    return [...rows].sort((a, b) => {
      const aPending = a.status === "PENDING" ? 0 : 1;
      const bPending = b.status === "PENDING" ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [data, statusFilter, search]);

  const setFilter = (value: string) => {
    router.replace(value ? `/grants?status=${value}` : "/grants");
  };

  return (
    <main className="p-8 space-y-6 max-w-5xl">
      <PageHeader
        title="Grants"
        description="Every app that has asked for access to your keys, and exactly what each one got."
        actions={
          <Link href="/grants/new" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Connect an app
          </Link>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="segmented">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setFilter(filter.value)}
                className={
                  statusFilter === filter.value
                    ? "segmented-item-active"
                    : "segmented-item"
                }
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative flex-1 min-w-[12rem] max-w-xs ml-auto">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={searchRef}
            className="input pl-9 pr-8"
            placeholder="Search apps…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {!search && (
            <kbd className="kbd absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              /
            </kbd>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="card p-5">
          <LoadingRows rows={4} />
        </div>
      ) : error ? (
        <ErrorState
          message={`Failed to load grants: ${error.message}`}
          onRetry={() => refetch()}
        />
      ) : grants.length === 0 ? (
        <EmptyState
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
          }
          title={
            search
              ? `No apps matching “${search}”`
              : statusFilter
                ? `No ${statusFilter.toLowerCase()} grants`
                : "No grants yet"
          }
          description={
            search || statusFilter
              ? "Try a different filter."
              : "Connect an app and it'll ask for exactly the access it needs — you decide what it actually gets."
          }
          action={
            !search &&
            !statusFilter && (
              <Link href="/grants/new" className="btn-primary">
                Connect an app
              </Link>
            )
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {grants.map((grant) => {
              const { label, value } = lifetime(grant);
              const name = appName(grant);
              return (
                <li key={grant.id}>
                  <Link
                    href={`/grants/${grant.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <span className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white font-semibold text-sm flex items-center justify-center">
                      {name.charAt(0).toUpperCase()}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {name}
                        </span>
                        <span className={statusBadge(grant.status)}>
                          {grant.status.toLowerCase().replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {grant._count.permissions} permission
                        {grant._count.permissions === 1 ? "" : "s"} ·{" "}
                        {grant.runtime} ·{" "}
                        {grant.authType === "POP" ? "signing keys" : "static token"}
                      </p>
                    </div>

                    <div className="hidden sm:block text-right shrink-0">
                      <p className="eyebrow">{label}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        {value ? (
                          <RelativeTime value={value} />
                        ) : (
                          <span className="text-slate-400">never</span>
                        )}
                      </p>
                    </div>

                    <div className="hidden md:block text-right shrink-0 w-28">
                      <p className="eyebrow">Last used</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        <RelativeTime value={grant.lastUsedAt} />
                      </p>
                    </div>

                    <svg
                      className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ul>
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
