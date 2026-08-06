"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/connectors");
      if (res.status === 401) {
        window.location.href = "/dashboard";
        return;
      }
      const data = await res.json();
      setConnectors(data.connectors ?? []);
      setError(null);
    } catch {
      setError("Failed to load connectors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (row: ConnectorRow) => {
    await fetch(`/api/admin/connectors/${encodeURIComponent(row.connectorId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    load();
  };

  const restoreBuiltins = async () => {
    await fetch("/api/admin/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restoreBuiltins: true }),
    });
    load();
  };

  return (
    <main className="min-h-screen max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Connectors
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Provider integrations — declarative documents, frozen at install.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/connectors/install" className="btn-primary text-sm">
            Install from URL
          </Link>
          <Link href="/connectors/new" className="btn-secondary text-sm">
            Build custom
          </Link>
          <Link href="/dashboard" className="btn-ghost text-sm">
            Dashboard
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
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
