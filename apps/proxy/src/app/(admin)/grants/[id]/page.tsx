"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useGrantDetail, useGrantAction } from "@/hooks/useGrants";
import {
  AppIdentityCard,
  RequestReviewCard,
  RawJsonExpander,
  type GrantDocumentShape,
} from "@/components/document/GrantDocumentReview";

// ============================================
// GRANT DETAIL — frozen document viewer, decisions, per-resource usage,
// token panel (copy-paste window pre-first-use), lifecycle actions,
// audit tail.
// ============================================

interface PermissionRow {
  id: string;
  resourceId: string;
  action: string;
  status: string;
  expiresAt: string | null;
  dailyQuota: number | null;
  dailyTokenBudget: number | null;
  constraints: Record<string, unknown> | null;
  usage: {
    dailyRequests: number;
    dailyTokens: number;
    monthlyRequests: number;
    monthlyTokens: number;
  };
}

interface TokenRow {
  id: string;
  displayPrefix: string;
  expiresAt: string;
  revokedAt: string | null;
  firstUsedAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  displayableToken: string | null;
}

interface GrantDetail {
  id: string;
  status: string;
  authType: string;
  runtime: string;
  expiresAt: string | null;
  currentPeriodEnd: string | null;
  renewalPeriodDays: number | null;
  egressIps: string | null;
  allowBrowser: boolean;
  document: GrantDocumentShape;
  decisions: Record<string, unknown> | null;
  permissions: PermissionRow[];
  tokens: TokenRow[];
}

interface AuditRow {
  id: string;
  resourceId: string;
  action: string;
  decision: string;
  decisionReason: string | null;
  latencyMs: number | null;
  timestamp: string;
}

function UsageBar({ used, cap, label }: { used: number; cap: number | null; label: string }) {
  const pct = cap ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div className="text-xs">
      <div className="flex justify-between text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        <span>
          {used}
          {cap ? ` / ${cap}` : " (no cap)"}
        </span>
      </div>
      {cap && (
        <div className="h-1.5 mt-0.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div
            className={`h-full ${pct > 90 ? "bg-red-500" : "bg-primary-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function GrantDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useGrantDetail(params.id);
  const action = useGrantAction(params.id);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (error) {
    return (
      <main className="p-8 space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load grant: {error.message}
        </p>
        <div className="flex items-center gap-3">
          <button className="btn-secondary text-sm" onClick={() => refetch()}>
            Retry
          </button>
          <Link href="/grants" className="text-sm text-slate-400 underline">
            ← All grants
          </Link>
        </div>
      </main>
    );
  }

  if (isLoading || !data) {
    return <main className="p-6 text-slate-500">Loading…</main>;
  }

  const grant = data.grant as unknown as GrantDetail;
  const auditTail = data.auditTail as unknown as AuditRow[];
  const doc = grant.document;
  const activeToken = grant.tokens.find((t) => !t.revokedAt);

  const run = async (actionName: string) => {
    if (
      (actionName === "revoke" || actionName === "deny") &&
      !confirm(`Really ${actionName} this grant? This is immediate.`)
    ) {
      return;
    }
    setMessage(null);
    try {
      const result = await action.mutateAsync({ action: actionName });
      if (result.token) setFreshToken(result.token);
      setMessage(`${actionName} done.`);
      refetch();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `${actionName} failed`);
    }
  };

  return (
    <main className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {doc.app?.name ?? "Grant"}
        </h1>
        <Link href="/grants" className="text-sm text-slate-400 underline">
          ← All grants
        </Link>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
          {message}
        </div>
      )}

      {/* Identity + state */}
      <section className="card p-4 space-y-3">
        <AppIdentityCard app={doc.app} />
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            {grant.status.toLowerCase().replace(/_/g, " ")}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            auth: {grant.authType === "POP" ? "PoP" : "bearer"}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            runtime: {grant.runtime}
          </span>
          {grant.currentPeriodEnd && (
            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
              period ends {new Date(grant.currentPeriodEnd).toLocaleDateString()}
            </span>
          )}
          {grant.expiresAt && (
            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
              expires {new Date(grant.expiresAt).toLocaleDateString()}
            </span>
          )}
          {grant.egressIps && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
              IP-pinned
            </span>
          )}
        </div>

        {/* Lifecycle actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          {grant.status === "PENDING" && (
            <Link href={`/connect/approve?grant=${grant.id}`} className="btn-primary text-xs">
              Review & approve
            </Link>
          )}
          {grant.renewalPeriodDays && ["ACTIVE", "EXPIRED"].includes(grant.status) && (
            <button className="btn-secondary text-xs" onClick={() => run("renew")}>
              Renew ({grant.renewalPeriodDays}d)
            </button>
          )}
          {grant.status === "ACTIVE" && (
            <button className="btn-secondary text-xs" onClick={() => run("suspend")}>
              Suspend
            </button>
          )}
          {grant.status.startsWith("SUSPENDED") && (
            <button className="btn-secondary text-xs" onClick={() => run("reactivate")}>
              Reactivate
            </button>
          )}
          {grant.authType === "BEARER" && grant.status === "ACTIVE" && (
            <button className="btn-secondary text-xs" onClick={() => run("regenerate_token")}>
              Regenerate token
            </button>
          )}
          {!["REVOKED", "DENIED"].includes(grant.status) && (
            <button className="btn-secondary text-xs text-red-600" onClick={() => run("revoke")}>
              Revoke
            </button>
          )}
        </div>
      </section>

      {/* Token panel */}
      {grant.authType === "BEARER" && (
        <section className="card p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Token</h2>
          {freshToken && (
            <div className="p-3 rounded-lg bg-slate-900 dark:bg-slate-800 flex items-center gap-2">
              <code className="flex-1 text-xs text-emerald-300 font-mono break-all select-all">
                {freshToken}
              </code>
              <button
                className="btn-secondary text-xs"
                onClick={() => navigator.clipboard.writeText(freshToken)}
              >
                Copy
              </button>
            </div>
          )}
          {grant.tokens.map((token) => (
            <div key={token.id} className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-2">
              <code className="font-mono">{token.displayPrefix}…</code>
              {token.revokedAt ? (
                <span className="text-red-500">revoked</span>
              ) : new Date(token.expiresAt) < new Date() ? (
                <span className="text-slate-400">expired {new Date(token.expiresAt).toLocaleDateString()}</span>
              ) : (
                <span className="text-emerald-600">active until {new Date(token.expiresAt).toLocaleDateString()}</span>
              )}
              <span className="text-slate-400">
                {token.lastUsedAt
                  ? `last used ${new Date(token.lastUsedAt).toLocaleString()}${token.lastUsedIp ? ` from ${token.lastUsedIp}` : ""}`
                  : "never used"}
              </span>
              {token.displayableToken && !freshToken && (
                <button
                  className="text-primary-600 dark:text-primary-400 underline"
                  onClick={() => setFreshToken(token.displayableToken)}
                >
                  Show token (unused — copy-paste window open)
                </button>
              )}
            </div>
          ))}
          {grant.tokens.length === 0 && (
            <p className="text-xs text-slate-500">No tokens minted.</p>
          )}
        </section>
      )}

      {/* Permissions + usage */}
      <section className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Resources & usage
        </h2>
        {grant.permissions.map((permission) => (
          <div
            key={permission.id}
            className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2"
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono text-slate-900 dark:text-white">
                {permission.resourceId} · {permission.action}
              </span>
              <span
                className={`text-xs ${permission.status === "ACTIVE" ? "text-emerald-600" : "text-slate-400"}`}
              >
                {permission.status.toLowerCase()}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <UsageBar
                used={permission.usage.dailyRequests}
                cap={permission.dailyQuota}
                label="Requests today"
              />
              <UsageBar
                used={permission.usage.dailyTokens}
                cap={permission.dailyTokenBudget}
                label="Tokens today"
              />
            </div>
            {permission.constraints && Object.keys(permission.constraints).length > 0 && (
              <p className="text-xs text-slate-500 font-mono">
                {JSON.stringify(permission.constraints)}
              </p>
            )}
          </div>
        ))}
      </section>

      {/* Frozen document + decisions */}
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
          Frozen request document
        </h2>
        <div className="space-y-3">
          {doc.requests?.map((request, i) => (
            <RequestReviewCard key={i} request={request} />
          ))}
        </div>
        <RawJsonExpander value={{ document: doc, decisions: grant.decisions }} />
      </section>

      {/* Audit tail */}
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
          Recent requests
        </h2>
        {auditTail.length === 0 ? (
          <p className="text-sm text-slate-500">No requests yet.</p>
        ) : (
          <ul className="space-y-1">
            {auditTail.map((log) => (
              <li key={log.id} className="text-xs flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${log.decision === "ALLOWED" ? "bg-emerald-500" : "bg-red-500"}`}
                />
                <span className="text-slate-700 dark:text-slate-200">
                  {log.resourceId} {log.action}
                </span>
                {log.decision !== "ALLOWED" && (
                  <span className="text-red-500">{log.decisionReason ?? log.decision}</span>
                )}
                <span className="text-slate-400 ml-auto">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
