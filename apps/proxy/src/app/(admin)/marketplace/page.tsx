"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// ============================================
// CONNECTOR MARKETPLACE (9.6)
// Grid from the registry index; install goes through the exact 9.4
// review flow (install page with ?url=&registry=1).
// ============================================

interface RegistryEntry {
  id: string;
  name: string;
  description: string;
  resourceType: string;
  version: string;
  path: string;
  official?: boolean;
}

export default function MarketplacePage() {
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [installed, setInstalled] = useState<Record<string, string>>({});
  const [registryUrl, setRegistryUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/connectors/marketplace");
        const data = await res.json();
        // The error payload also carries registryUrl — keep it so the
        // error banner can say which registry failed.
        setRegistryUrl(data.registryUrl ?? "");
        if (!res.ok) throw new Error(data.error ?? "Failed to load registry");
        setEntries(data.entries ?? []);
        setInstalled(data.installed ?? {});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load registry");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const types = useMemo(
    () => [...new Set(entries.map((e) => e.resourceType))].sort(),
    [entries],
  );

  const filtered = entries.filter(
    (entry) =>
      (!typeFilter || entry.resourceType === typeFilter) &&
      (!search ||
        `${entry.id} ${entry.name} ${entry.description}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );

  const connectorUrl = (entry: RegistryEntry) => {
    // path is relative to the registry index location
    const base = registryUrl.slice(0, registryUrl.lastIndexOf("/") + 1);
    return new URL(entry.path, base).toString();
  };

  return (
    <main className="min-h-screen max-w-4xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Marketplace
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Curated connectors. Every install is reviewed and frozen.
          </p>
        </div>
        <Link href="/connectors" className="text-sm text-slate-400 underline">
          ← Installed connectors
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input text-sm flex-1 min-w-48"
          placeholder="Search connectors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={`px-3 py-1 rounded-full text-xs font-medium ${!typeFilter ? "bg-primary-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}
          onClick={() => setTypeFilter(null)}
        >
          All
        </button>
        {types.map((type) => (
          <button
            key={type}
            className={`px-3 py-1 rounded-full text-xs font-medium ${typeFilter === type ? "bg-primary-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}
            onClick={() => setTypeFilter(type)}
          >
            {type}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300 space-y-1">
          <p>
            {error} — is the registry URL reachable?{" "}
            {registryUrl && <span className="font-mono text-xs">({registryUrl})</span>}
          </p>
          <p className="text-xs">
            You can change the registry URL in{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>
            , or install connectors directly from a URL or the custom builder
            below.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading registry…</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((entry) => {
            const installedVersion = installed[entry.id];
            const updateAvailable =
              installedVersion && installedVersion !== entry.version;
            return (
              <div key={entry.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {entry.name}
                    </p>
                    <p className="text-xs font-mono text-slate-500">
                      {entry.id} · v{entry.version}
                    </p>
                  </div>
                  {entry.official && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      Official
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {entry.description}
                </p>
                <div className="mt-3">
                  {installedVersion && !updateAvailable ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                      ✓ Installed (v{installedVersion})
                    </span>
                  ) : (
                    <Link
                      href={`/connectors/install?url=${encodeURIComponent(connectorUrl(entry))}&registry=1`}
                      className="btn-primary text-xs"
                    >
                      {updateAvailable
                        ? `Review update v${entry.version}`
                        : "Install"}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && !error && (
            <p className="text-sm text-slate-500">Nothing matches.</p>
          )}
        </div>
      )}

      <p className="text-xs text-slate-400">
        <Link href="/connectors/install" className="underline">
          Install from URL instead
        </Link>{" "}
        ·{" "}
        <Link href="/connectors/new" className="underline">
          Build a custom connector
        </Link>
      </p>
    </main>
  );
}
