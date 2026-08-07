"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { TrustBadge, type TrustLevel } from "@/components/connectors/ConnectorReview";

// ============================================
// CONNECTORS LIST
// Cards: name, version, source badge, enabled toggle, credential
// status, update-available pill.
// ============================================

interface ConnectorRow {
  id: string;
  connectorId: string;
  resourceType: string;
  version: string;
  source: "BUILTIN" | "REGISTRY" | "URL" | "CUSTOM";
  enabled: boolean;
  updateAvailable: { version: string } | null;
  credentialsConfigured: boolean;
  document: { name: string; description?: string };
}

const TRUST: Record<ConnectorRow["source"], TrustLevel> = {
  BUILTIN: "builtin",
  REGISTRY: "registry",
  URL: "url",
  CUSTOM: "custom",
};

export default function ConnectorsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const {
    data,
    isLoading: loading,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: ["connectors"],
    queryFn: () =>
      api.get<{ connectors: ConnectorRow[] }>("/api/admin/connectors"),
  });
  const connectors = data?.connectors ?? [];

  const toggle = async (row: ConnectorRow) => {
    setError(null);
    setMessage(null);
    try {
      await api.patch(
        `/api/admin/connectors/${encodeURIComponent(row.connectorId)}`,
        { enabled: !row.enabled },
      );
      queryClient.invalidateQueries({ queryKey: ["connectors"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update connector");
    }
  };

  const restoreBuiltins = async () => {
    setError(null);
    setMessage(null);
    try {
      await api.post("/api/admin/connectors", { restoreBuiltins: true });
      setMessage("Built-in connectors restored.");
      queryClient.invalidateQueries({ queryKey: ["connectors"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore built-ins");
    }
  };

  return (
    <main className="min-h-screen max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Connectors
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Provider integrations — declarative documents, frozen at install.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/marketplace" className="btn-primary text-sm">
            Marketplace
          </Link>
          <Link href="/connectors/install" className="btn-secondary text-sm">
            Install from URL
          </Link>
          <Link href="/connectors/new" className="btn-secondary text-sm">
            Build custom
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
          {message}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : loadError ? (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 space-y-2">
          <p>Failed to load connectors: {loadError.message}</p>
          <button className="btn-secondary text-xs" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {connectors.map((row) => (
            <Link
              key={row.id}
              href={`/connectors/${encodeURIComponent(row.connectorId)}`}
              className="card p-4 block hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {row.document.name}
                  </p>
                  <p className="text-xs font-mono text-slate-500">
                    {row.connectorId} · v{row.version}
                  </p>
                </div>
                <TrustBadge trust={TRUST[row.source]} />
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    toggle(row);
                  }}
                  className={`px-2 py-0.5 rounded-full font-medium ${
                    row.enabled
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                  }`}
                >
                  {row.enabled ? "Enabled" : "Disabled"}
                </button>
                <span
                  className={
                    row.credentialsConfigured
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {row.credentialsConfigured
                    ? "● credentials set"
                    : "○ no credentials"}
                </span>
                {row.updateAvailable && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    v{row.updateAvailable.version} available
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <button
        onClick={restoreBuiltins}
        className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
      >
        Restore built-in connectors
      </button>
    </main>
  );
}
