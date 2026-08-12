"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ResourceTypeIcon } from "@/components/grant/approval-parts";
import {
  EmptyState,
  LoadingRows,
  PageHeader,
  Segmented,
  useSlashFocus,
} from "@/components/ui";

// ============================================
// CONNECTOR MARKETPLACE
// Grid from the registry index; every install still goes through the
// full review flow (install page with ?url=&registry=1) — nothing here
// installs in one click, by design.
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
  const [typeFilter, setTypeFilter] = useState<string>("");
  const searchRef = useSlashFocus<HTMLInputElement>();

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
        setError(
          err instanceof Error ? err.message : "Failed to load registry",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const types = useMemo(
    () => [...new Set(entries.map((entry) => entry.resourceType))].sort(),
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
    <main className="p-8 space-y-5 max-w-4xl">
      <PageHeader
        title="Marketplace"
        description="Curated connectors. Every install is reviewed against its egress hosts and frozen at the version you approved."
        breadcrumb={
          <Link
            href="/connectors"
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            ← Installed connectors
          </Link>
        }
      />

      {error && (
        <div className="callout-warning space-y-1">
          <p>
            {error} — is the registry reachable?{" "}
            {registryUrl && (
              <code className="code-inline">{registryUrl}</code>
            )}
          </p>
          <p className="text-xs">
            Change the registry URL in{" "}
            <Link href="/settings" className="underline underline-offset-2">
              Settings
            </Link>
            , or install a connector directly from a URL.
          </p>
        </div>
      )}

      {types.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="overflow-x-auto scrollbar-hide">
            <Segmented
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "", label: "All" },
                ...types.map((type) => ({ value: type, label: type })),
              ]}
            />
          </div>
          <div className="relative max-w-[14rem] ml-auto">
            <input
              ref={searchRef}
              className="input pr-8"
              placeholder="Search connectors…"
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
      )}

      {loading ? (
        <div className="card p-5">
          <LoadingRows rows={4} />
        </div>
      ) : filtered.length === 0 ? (
        !error && (
          <EmptyState
            icon={
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            }
            title={search ? `Nothing matching “${search}”` : "Registry is empty"}
            description="You can still install any connector from a URL, or build your own."
            action={
              <Link href="/connectors/install" className="btn-primary">
                Install from URL
              </Link>
            }
          />
        )
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 stagger">
          {filtered.map((entry, index) => {
            const installedVersion = installed[entry.id];
            const updateAvailable =
              installedVersion && installedVersion !== entry.version;
            return (
              <div
                key={entry.id}
                className="card card-hover p-4 flex flex-col gap-3"
                style={{ "--i": index } as React.CSSProperties}
              >
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                    <ResourceTypeIcon
                      resourceType={entry.resourceType}
                      className="w-[18px] h-[18px]"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {entry.name}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400 truncate">
                      {entry.id} · v{entry.version}
                    </p>
                  </div>
                  {entry.official && (
                    <span className="badge-success shrink-0">Official</span>
                  )}
                </div>

                <p className="field-hint truncate-2">{entry.description}</p>

                <div className="mt-auto pt-1">
                  {installedVersion && !updateAvailable ? (
                    <span className="badge-success">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Installed · v{installedVersion}
                    </span>
                  ) : (
                    <Link
                      href={`/connectors/install?url=${encodeURIComponent(
                        connectorUrl(entry),
                      )}&registry=1`}
                      className={
                        updateAvailable
                          ? "btn-secondary btn-sm"
                          : "btn-primary btn-sm"
                      }
                    >
                      {updateAvailable
                        ? `Review update to v${entry.version}`
                        : "Review & install"}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="field-hint">
        <Link
          href="/connectors/install"
          className="underline underline-offset-2"
        >
          Install from a URL instead
        </Link>{" "}
        ·{" "}
        <Link href="/connectors/new" className="underline underline-offset-2">
          Build a custom connector
        </Link>
      </p>
    </main>
  );
}
