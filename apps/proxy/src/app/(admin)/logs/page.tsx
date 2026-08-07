"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

// ============================================
// LOGS — RequestLog table with filters + detail drawer
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

const DECISIONS = [
  "",
  "ALLOWED",
  "DENIED_AUTH",
  "DENIED_PERMISSION",
  "DENIED_RATE_LIMIT",
  "DENIED_BUDGET",
  "DENIED_CONSTRAINT",
  "ERROR",
];

export default function LogsPage() {
  const [decision, setDecision] = useState("");
  const [connectorId, setConnectorId] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const query = new URLSearchParams();
  if (decision) query.set("decision", decision);
  if (connectorId) query.set("connectorId", connectorId);
  query.set("page", String(page));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["logs", decision, connectorId, page],
    queryFn: () =>
      api.get<{ logs: LogRow[]; total: number; pageSize: number }>(
        `/api/admin/logs?${query}`,
      ),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main className="p-8 space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Logs</h1>

      <div className="flex flex-wrap gap-2">
        <select
          className="input text-sm"
          value={decision}
          onChange={(e) => {
            setDecision(e.target.value);
            setPage(1);
          }}
        >
          {DECISIONS.map((d) => (
            <option key={d} value={d}>
              {d || "All decisions"}
            </option>
          ))}
        </select>
        <input
          className="input text-sm font-mono"
          placeholder="filter connector (llm:groq)"
          value={connectorId}
          onChange={(e) => {
            setConnectorId(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : error ? (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 space-y-2">
          <p>Failed to load logs: {error.message}</p>
          <button className="btn-secondary text-xs" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto card">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="p-2.5">Time</th>
                  <th className="p-2.5">App</th>
                  <th className="p-2.5">Resource</th>
                  <th className="p-2.5">Decision</th>
                  <th className="p-2.5">Latency</th>
                  <th className="p-2.5">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data?.logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    onClick={() => setSelected(log)}
                  >
                    <td className="p-2.5 text-xs text-slate-500">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-2.5">{log.app?.name ?? "—"}</td>
                    <td className="p-2.5 font-mono text-xs">
                      {log.resourceId} {log.action}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          log.decision === "ALLOWED"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                        }`}
                      >
                        {log.decision.toLowerCase()}
                      </span>
                    </td>
                    <td className="p-2.5 text-xs text-slate-500">
                      {log.latencyMs != null ? `${log.latencyMs}ms` : "—"}
                    </td>
                    <td className="p-2.5 text-xs text-slate-500">
                      {log.costEstimate != null ? `$${log.costEstimate.toFixed(4)}` : "—"}
                    </td>
                  </tr>
                ))}
                {data && data.logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-sm text-slate-500">
                      No log entries match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <button
              className="btn-secondary text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Prev
            </button>
            <span className="text-slate-500">
              Page {page} / {totalPages} ({data?.total ?? 0} entries)
            </span>
            <button
              className="btn-secondary text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        </>
      )}

      {/* Detail drawer */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex justify-end"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md h-full bg-white dark:bg-slate-900 p-6 overflow-y-auto space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white">
                Request detail
              </h2>
              <button className="text-slate-400" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
            <dl className="text-sm space-y-1.5">
              {(
                [
                  ["Time", new Date(selected.timestamp).toLocaleString()],
                  ["App", selected.app?.name ?? "—"],
                  ["Endpoint", `${selected.method} ${selected.endpoint}`],
                  ["Resource", `${selected.resourceId} · ${selected.action}`],
                  ["Decision", selected.decision],
                  ["Reason", selected.decisionReason ?? "—"],
                  ["Latency", selected.latencyMs != null ? `${selected.latencyMs}ms` : "—"],
                  ["Est. cost", selected.costEstimate != null ? `$${selected.costEstimate.toFixed(5)}` : "—"],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className="text-slate-800 dark:text-slate-200 break-all">{value}</dd>
                </div>
              ))}
            </dl>
            {selected.metadata && (
              <pre className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs overflow-x-auto">
                {JSON.stringify(selected.metadata, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
