"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { TrustBadge, type TrustLevel } from "@/components/connectors/ConnectorReview";
import { ResourceTypeIcon } from "@/components/grant/approval-parts";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  useConfirm,
  useToast,
  useSlashFocus,
} from "@/components/ui";

// ============================================
// CONNECTORS LIST
// Cards: name, version, trust badge, enabled toggle, credential status,
// update-available pill. Connectors without credentials are called out
// loudly — an enabled connector with no key is the single most common
// reason a grant looks fine but every request fails.
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
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();

  const [search, setSearch] = useState("");
  const searchRef = useSlashFocus<HTMLInputElement>();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["connectors"],
    queryFn: () =>
      api.get<{ connectors: ConnectorRow[] }>("/api/admin/connectors"),
  });
  const connectors = data?.connectors ?? [];
  const missingCredentials = connectors.filter(
    (row) => row.enabled && !row.credentialsConfigured,
  );

  const needle = search.trim().toLowerCase();
  const visible = needle
    ? connectors.filter((row) =>
        [row.document.name, row.connectorId, row.document.description ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : connectors;

  const toggle = async (row: ConnectorRow) => {
    try {
      await api.patch(
        `/api/admin/connectors/${encodeURIComponent(row.connectorId)}`,
        { enabled: !row.enabled },
      );
      queryClient.invalidateQueries({ queryKey: ["connectors"] });
      toast.success(
        `${row.document.name} ${row.enabled ? "disabled" : "enabled"}`,
      );
    } catch (err) {
      toast.error(
        "Couldn't update the connector",
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const restoreBuiltins = async () => {
    const ok = await confirm({
      title: "Restore built-in connectors?",
      body: "The shipped documents overwrite the built-ins currently installed. Any edits you made to them are lost; connectors you installed yourself are untouched.",
      confirmLabel: "Restore",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.post("/api/admin/connectors", { restoreBuiltins: true });
      queryClient.invalidateQueries({ queryKey: ["connectors"] });
      toast.success("Built-in connectors restored");
    } catch (err) {
      toast.error(
        "Restore failed",
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  return (
    <main className="p-8 space-y-5 max-w-4xl">
      <PageHeader
        title="Connectors"
        description="Provider integrations — declarative documents, frozen at install. Each one names the API it talks to and exactly what the gateway may enforce on it."
        actions={
          <>
            <Link href="/marketplace" className="btn-primary">
              Browse marketplace
            </Link>
            <Link href="/connectors/install" className="btn-secondary">
              Install from URL
            </Link>
          </>
        }
      />

      {missingCredentials.length > 0 && (
        <p className="callout-warning">
          {missingCredentials.length} enabled connector
          {missingCredentials.length > 1 ? "s have" : " has"} no credentials
          stored — requests routed to{" "}
          {missingCredentials.map((row) => row.connectorId).join(", ")} will
          fail until you add a key.
        </p>
      )}

      {isLoading ? (
        <div className="card p-5">
          <LoadingRows rows={4} />
        </div>
      ) : error ? (
        <ErrorState
          message={`Failed to load connectors: ${error.message}`}
          onRetry={() => refetch()}
        />
      ) : connectors.length > 0 ? (
        <div className="flex justify-end">
          <div className="relative max-w-[14rem] w-full">
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
      ) : null}

      {isLoading || error ? null : connectors.length === 0 ? (
        <EmptyState
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          }
          title="No connectors installed"
          description="Install one from the marketplace, or wrap any REST API yourself — connectors are plain JSON, no code required."
          action={
            <Link href="/marketplace" className="btn-primary">
              Browse marketplace
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <p className="field-hint text-center py-8">
          No connectors matching &ldquo;{search}&rdquo;.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 stagger">
          {visible.map((row, index) => (
            <div
              key={row.id}
              className="card card-hover p-4 flex flex-col gap-3"
              style={{ "--i": index } as React.CSSProperties}
            >
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                  <ResourceTypeIcon
                    resourceType={row.resourceType}
                    className="w-[18px] h-[18px]"
                  />
                </span>
                <Link
                  href={`/connectors/${encodeURIComponent(row.connectorId)}`}
                  className="min-w-0 flex-1 group"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:underline">
                    {row.document.name}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 truncate">
                    {row.connectorId} · v{row.version}
                  </p>
                </Link>
                <TrustBadge trust={TRUST[row.source]} />
              </div>

              {row.document.description && (
                <p className="field-hint truncate-2">
                  {row.document.description}
                </p>
              )}

              <div className="flex items-center gap-2 flex-wrap mt-auto pt-1">
                <button
                  onClick={() => toggle(row)}
                  className={row.enabled ? "badge-success" : "badge-neutral"}
                >
                  {row.enabled ? "Enabled" : "Disabled"}
                </button>
                <span
                  className={
                    row.credentialsConfigured
                      ? "badge-neutral"
                      : "badge-warning"
                  }
                >
                  {row.credentialsConfigured
                    ? "credentials set"
                    : "no credentials"}
                </span>
                {row.updateAvailable && (
                  <Link
                    href={`/connectors/${encodeURIComponent(row.connectorId)}`}
                    className="badge-info"
                  >
                    v{row.updateAvailable.version} available
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Link href="/connectors/new" className="btn-secondary btn-sm">
          Build a custom connector
        </Link>
        <button
          onClick={restoreBuiltins}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2"
        >
          Restore built-in connectors
        </button>
      </div>

      {confirmDialog}
    </main>
  );
}
