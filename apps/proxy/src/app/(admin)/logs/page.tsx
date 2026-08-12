"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  CopyButton,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  RelativeTime,
  useSlashFocus,
} from "@/components/ui";

// ============================================
// LOGS — every request the gateway decided on, with a detail drawer.
// Refusals are the interesting rows here, so they're styled by REASON
// rather than lumped into one red "denied".
//
// Filters live in the URL (like the grants list), so a filtered view
// survives refresh and can be linked. Page 1 tails live: new requests
// appear on their own while the owner is watching.
// ============================================

interface LogRow {
  id: string;
  resourceId: string;
  action: string;
  endpoint: string;
  method: string;
  decision: string;
  decisionReason: string | null;
  latencyMs: number | null;
  metadata: Record<string, unknown> | null;
  costEstimate: number | null;
  timestamp: string;
  app: { name: string } | null;
}

const DECISION_FILTERS = [
  { value: "", label: "All" },
  { value: "ALLOWED", label: "Allowed" },
  { value: "DENIED_AUTH", label: "Auth" },
  { value: "DENIED_PERMISSION", label: "Permission" },
  { value: "DENIED_RATE_LIMIT", label: "Rate limit" },
  { value: "DENIED_BUDGET", label: "Budget" },
  { value: "DENIED_CONSTRAINT", label: "Constraint" },
  { value: "ERROR", label: "Errors" },
];

function decisionBadge(decision: string): string {
  if (decision === "ALLOWED") return "badge-success";
  if (decision === "ERROR") return "badge-warning";
  return "badge-danger";
}

function LogsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const decision = searchParams.get("decision") ?? "";
  const connectorId = searchParams.get("resource") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [selected, setSelected] = useState<LogRow | null>(null);
  const searchRef = useSlashFocus<HTMLInputElement>();

  // The text filter echoes locally and lands in the URL debounced —
  // replace-per-keystroke would spam history-adjacent state for nothing.
  const [resourceInput, setResourceInput] = useState(connectorId);
  useEffect(() => setResourceInput(connectorId), [connectorId]);

  const setParams = (
    updates: Partial<{ decision: string; resource: string; page: number }>,
  ) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === 1) next.delete(key);
      else next.set(key, String(value));
    }
    router.replace(next.size ? `/logs?${next}` : "/logs");
  };

  useEffect(() => {
    if (resourceInput === connectorId) return;
    const handle = setTimeout(
      () => setParams({ resource: resourceInput, page: 1 }),
      300,
    );
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceInput]);

  const query = new URLSearchParams();
  if (decision) query.set("decision", decision);
  if (connectorId) query.set("connectorId", connectorId);
  query.set("page", String(page));

  // Page 1 is a live tail — while the owner watches (and no drawer is
  // open), fresh decisions roll in on their own.
  const tailing = page === 1 && !selected;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["logs", decision, connectorId, page],
    queryFn: () =>
      api.get<{ logs: LogRow[]; total: number; pageSize: number }>(
        `/api/admin/logs?${query}`,
      ),
    refetchInterval: tailing ? 10_000 : false,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <main className="p-8 space-y-5 max-w-5xl">
      <PageHeader
        title="Logs"
        description="Every request the gateway decided on, newest first. Click a row for the full record."
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="segmented">
            {DECISION_FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setParams({ decision: filter.value, page: 1 })}
                className={
                  decision === filter.value
                    ? "segmented-item-active"
                    : "segmented-item"
                }
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        {tailing && (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
            title="Newest requests refresh automatically on this page"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
            Live
          </span>
        )}
        <div className="relative max-w-[14rem] ml-auto">
          <input
            ref={searchRef}
            className="input font-mono pr-8"
            placeholder="llm:groq"
            value={resourceInput}
            onChange={(event) => setResourceInput(event.target.value)}
          />
          {!resourceInput && (
            <kbd className="kbd absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              /
            </kbd>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="card p-5">
          <LoadingRows rows={6} />
        </div>
      ) : error ? (
        <ErrorState
          message={`Failed to load logs: ${error.message}`}
          onRetry={() => refetch()}
        />
      ) : data && data.logs.length === 0 ? (
        <EmptyState
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zM3.75 12h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z" />
            </svg>
          }
          title="No matching requests"
          description={
            decision || connectorId
              ? "Nothing matches these filters. Try widening them."
              : "Once an approved app starts calling through, every decision lands here."
          }
        />
      ) : (
        <>
          <div className="table-container card">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>App</th>
                  <th>Resource</th>
                  <th>Decision</th>
                  <th className="text-right">Latency</th>
                  <th className="text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data?.logs.map((log) => (
                  <tr
                    key={log.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(log)}
                  >
                    <td className="text-xs whitespace-nowrap">
                      <RelativeTime value={log.timestamp} />
                    </td>
                    <td className="text-slate-800 dark:text-slate-200 truncate max-w-[10rem]">
                      {log.app?.name ?? "—"}
                    </td>
                    <td className="font-mono text-xs">
                      {log.resourceId}{" "}
                      <span className="text-slate-400">{log.action}</span>
                    </td>
                    <td>
                      <span className={decisionBadge(log.decision)}>
                        {log.decision.toLowerCase().replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="text-xs text-right tabular-nums">
                      {log.latencyMs != null ? `${log.latencyMs}ms` : "—"}
                    </td>
                    <td className="text-xs text-right tabular-nums">
                      {log.costEstimate != null
                        ? `$${log.costEstimate.toFixed(4)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setParams({ page: page - 1 })}
            >
              ← Previous
            </button>
            <span className="field-hint">
              Page {page} of {totalPages} · {(data?.total ?? 0).toLocaleString()}{" "}
              entries
            </span>
            <button
              className="btn-secondary btn-sm ml-auto"
              disabled={page >= totalPages}
              onClick={() => setParams({ page: page + 1 })}
            >
              Next →
            </button>
          </div>
        </>
      )}

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex justify-end"
          onClick={() => setSelected(null)}
        >
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] animate-fade-in" />
          <div
            className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-y-auto animate-slide-in-right"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-header sticky top-0 bg-white dark:bg-slate-900 z-10">
              <h2 className="section-title">Request detail</h2>
              <div className="flex items-center gap-1">
                <CopyButton
                  value={JSON.stringify(selected, null, 2)}
                  label="Copy JSON"
                  className="btn-ghost btn-sm"
                />
                <button
                  className="btn-icon"
                  aria-label="Close"
                  onClick={() => setSelected(null)}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <span className={decisionBadge(selected.decision)}>
                {selected.decision.toLowerCase().replace(/_/g, " ")}
              </span>
              {selected.decisionReason && (
                <p className="callout-danger">{selected.decisionReason}</p>
              )}

              <dl className="space-y-2.5 text-[13px]">
                {(
                  [
                    ["Time", new Date(selected.timestamp).toLocaleString()],
                    ["App", selected.app?.name ?? "—"],
                    ["Endpoint", `${selected.method} ${selected.endpoint}`],
                    ["Resource", selected.resourceId],
                    ["Action", selected.action],
                    [
                      "Latency",
                      selected.latencyMs != null
                        ? `${selected.latencyMs}ms`
                        : "—",
                    ],
                    [
                      "Estimated cost",
                      selected.costEstimate != null
                        ? `$${selected.costEstimate.toFixed(5)}`
                        : "—",
                    ],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex gap-3">
                    <dt className="w-28 shrink-0 text-slate-500 dark:text-slate-400">
                      {label}
                    </dt>
                    <dd className="text-slate-800 dark:text-slate-200 break-all min-w-0">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              {selected.metadata && (
                <div>
                  <p className="eyebrow mb-1.5">Metadata</p>
                  <pre className="code-block">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function LogsPage() {
  return (
    <Suspense>
      <LogsInner />
    </Suspense>
  );
}
