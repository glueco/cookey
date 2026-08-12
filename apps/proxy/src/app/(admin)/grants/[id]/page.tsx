"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useGrantDetail, useGrantAction } from "@/hooks/useGrants";
import {
  AppIdentityCard,
  RequestReviewCard,
  RawJsonExpander,
  describeConstraint,
  type GrantDocumentShape,
} from "@/components/document/GrantDocumentReview";
import {
  CopyButton,
  ErrorState,
  LoadingRows,
  PageHeader,
  RelativeTime,
  Section,
  UsageMeter,
  useConfirm,
  useToast,
} from "@/components/ui";

// ============================================
// GRANT DETAIL — the frozen document, what the owner decided, what the
// app has actually used, and every lever to change or end it.
// ============================================

interface PermissionRow {
  id: string;
  resourceId: string;
  action: string;
  status: string;
  expiresAt: string | null;
  dailyQuota: number | null;
  dailyTokenBudget: number | null;
  dailyCostBudgetUsd: number | null;
  constraints: Record<string, unknown> | null;
  usage: {
    dailyRequests: number;
    dailyTokens: number;
    dailyCostUsd: number;
    monthlyRequests: number;
    monthlyTokens: number;
    monthlyCostUsd: number;
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

export default function GrantDetailPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const { data, isLoading, error, refetch } = useGrantDetail(params.id);
  const action = useGrantAction(params.id);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  if (error) {
    return (
      <main className="p-8 space-y-6 max-w-4xl">
        <PageHeader
          title="Grant"
          breadcrumb={
            <Link href="/grants" className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
              ← All grants
            </Link>
          }
        />
        <ErrorState
          message={`Failed to load grant: ${error.message}`}
          onRetry={() => refetch()}
        />
      </main>
    );
  }

  if (isLoading || !data) {
    return (
      <main className="p-8 space-y-6 max-w-4xl">
        <div className="card p-5">
          <LoadingRows rows={4} />
        </div>
      </main>
    );
  }

  const grant = data.grant as unknown as GrantDetail;
  const auditTail = data.auditTail as unknown as AuditRow[];
  const doc = grant.document;
  const appLabel = doc.app?.name ?? "this app";

  // Confirmation copy names the consequence — "revoke" alone doesn't
  // tell the owner that live tokens die the moment they click.
  const CONFIRMATIONS: Record<
    string,
    { title: string; body: string; confirmLabel: string }
  > = {
    revoke: {
      title: `Revoke ${appLabel}'s access?`,
      body: "Its token stops working immediately and every permission is torn down. This can't be undone — the app has to request access again from scratch.",
      confirmLabel: "Revoke access",
    },
    suspend: {
      title: `Suspend ${appLabel}?`,
      body: "Requests are refused until you reactivate. The grant, its token and its budgets are all preserved.",
      confirmLabel: "Suspend",
    },
    regenerate_token: {
      title: "Regenerate the token?",
      body: "The current token is revoked at once. The app keeps working only after you paste the new one into it.",
      confirmLabel: "Regenerate",
    },
  };

  const run = async (actionName: string) => {
    const prompt = CONFIRMATIONS[actionName];
    if (prompt) {
      const ok = await confirm({
        ...prompt,
        tone: actionName === "suspend" ? "default" : "danger",
      });
      if (!ok) return;
    }
    try {
      const result = await action.mutateAsync({ action: actionName });
      if (result.token) setFreshToken(result.token);
      toast.success(`${actionName.replace(/_/g, " ")} done`);
      refetch();
    } catch (err) {
      toast.error(
        `Couldn't ${actionName.replace(/_/g, " ")}`,
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const facts: Array<[string, React.ReactNode]> = [
    ["Credential", grant.authType === "POP" ? "Signing keys (PoP)" : "Static token"],
    ["Runtime", grant.runtime],
    [
      "Expires",
      grant.expiresAt ? <RelativeTime value={grant.expiresAt} /> : "never",
    ],
    [
      "Renewal",
      grant.renewalPeriodDays
        ? `every ${grant.renewalPeriodDays} days`
        : "not renewable",
    ],
    ["Egress IPs", grant.egressIps ? grant.egressIps : "any address"],
    ["Browser requests", grant.allowBrowser ? "allowed" : "blocked"],
  ];

  return (
    <main className="p-8 space-y-6 max-w-4xl">
      <PageHeader
        title={doc.app?.name ?? "Grant"}
        breadcrumb={
          <Link
            href="/grants"
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            ← All grants
          </Link>
        }
        actions={
          <span className={statusBadge(grant.status)}>
            {grant.status.toLowerCase().replace(/_/g, " ")}
          </span>
        }
      />

      {/* Identity + lifecycle */}
      <section className="card p-5 space-y-5">
        <AppIdentityCard app={doc.app} />

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="eyebrow">{label}</dt>
              <dd className="text-[13px] text-slate-700 dark:text-slate-200 mt-0.5 truncate">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
          {grant.status === "PENDING" && (
            <Link
              href={`/connect/approve?grant=${grant.id}`}
              className="btn-primary btn-sm"
            >
              Review &amp; decide
            </Link>
          )}
          {grant.renewalPeriodDays &&
            ["ACTIVE", "EXPIRED"].includes(grant.status) && (
              <button
                className="btn-secondary btn-sm"
                onClick={() => run("renew")}
              >
                Renew {grant.renewalPeriodDays}d
              </button>
            )}
          {grant.status === "ACTIVE" && (
            <button
              className="btn-secondary btn-sm"
              onClick={() => run("suspend")}
            >
              Suspend
            </button>
          )}
          {grant.status.startsWith("SUSPENDED") && (
            <button
              className="btn-secondary btn-sm"
              onClick={() => run("reactivate")}
            >
              Reactivate
            </button>
          )}
          {grant.authType === "BEARER" && grant.status === "ACTIVE" && (
            <button
              className="btn-secondary btn-sm"
              onClick={() => run("regenerate_token")}
            >
              Regenerate token
            </button>
          )}
          {!["REVOKED", "DENIED"].includes(grant.status) && (
            <button
              className="btn-ghost btn-sm ml-auto text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              onClick={() => run("revoke")}
            >
              Revoke access
            </button>
          )}
        </div>
      </section>

      {/* Token */}
      {grant.authType === "BEARER" && (
        <Section title="Token">
          {freshToken && (
            <div className="mb-3">
              <p className="callout-warning mb-2">
                Copy this now — it is shown once and never again.
              </p>
              <div className="code-block flex items-center gap-2">
                <code className="flex-1 break-all select-all text-emerald-300">
                  {freshToken}
                </code>
                <CopyButton value={freshToken} />
              </div>
            </div>
          )}

          {grant.tokens.length === 0 ? (
            <p className="field-hint">No tokens have been minted.</p>
          ) : (
            <ul className="space-y-2">
              {grant.tokens.map((token) => {
                const expired = new Date(token.expiresAt) < new Date();
                return (
                  <li
                    key={token.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                  >
                    <code className="font-mono text-slate-700 dark:text-slate-200">
                      {token.displayPrefix}…
                    </code>
                    {token.revokedAt ? (
                      <span className="badge-danger">revoked</span>
                    ) : expired ? (
                      <span className="badge-neutral">expired</span>
                    ) : (
                      <span className="badge-success">
                        active until {new Date(token.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                    <span className="text-slate-500 dark:text-slate-400">
                      {token.lastUsedAt ? (
                        <>
                          last used <RelativeTime value={token.lastUsedAt} />
                          {token.lastUsedIp && ` from ${token.lastUsedIp}`}
                        </>
                      ) : (
                        "never used"
                      )}
                    </span>
                    {token.displayableToken && !freshToken && (
                      <button
                        className="text-primary-600 dark:text-primary-400 underline underline-offset-2 ml-auto"
                        onClick={() => setFreshToken(token.displayableToken)}
                      >
                        Show token (still unused)
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {/* Permissions grouped by resource */}
      <Section
        title="What it can reach"
        description="Live usage against the caps you set."
      >
        {grant.permissions.length === 0 ? (
          <p className="field-hint">
            No permissions were materialized for this grant.
          </p>
        ) : (
          <div className="space-y-3">
            {groupByResource(grant.permissions).map(([resourceId, rows]) => (
              <div
                key={resourceId}
                className="rounded-lg border border-slate-200 dark:border-slate-800"
              >
                <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800">
                  <code className="text-[13px] font-mono font-medium text-slate-900 dark:text-white">
                    {resourceId}
                  </code>
                  <span className="text-xs text-slate-400">
                    {rows.map((row) => row.action).join(" · ")}
                  </span>
                </div>
                <div className="p-3.5 space-y-3">
                  {rows.map((permission) => (
                    <div key={permission.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {permission.action}
                        </span>
                        <span
                          className={
                            permission.status === "ACTIVE"
                              ? "badge-success"
                              : "badge-neutral"
                          }
                        >
                          {permission.status.toLowerCase()}
                        </span>
                      </div>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <UsageMeter
                          used={permission.usage.dailyRequests}
                          cap={permission.dailyQuota}
                          label="Requests today"
                        />
                        <UsageMeter
                          used={permission.usage.dailyTokens}
                          cap={permission.dailyTokenBudget}
                          label="Tokens today"
                        />
                        <UsageMeter
                          used={permission.usage.dailyCostUsd}
                          cap={permission.dailyCostBudgetUsd}
                          label="Spend today"
                          format={(value) => `$${value.toFixed(2)}`}
                        />
                      </div>
                      {permission.constraints &&
                        Object.keys(permission.constraints).length > 0 && (
                          <ul className="flex flex-wrap gap-1.5 pt-0.5">
                            {Object.entries(permission.constraints).map(
                              ([key, value]) => (
                                <li key={key} className="badge-neutral">
                                  {describeConstraint(key, value)}
                                </li>
                              ),
                            )}
                          </ul>
                        )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Frozen document */}
      <Section
        title="What was asked for"
        description="The request document, frozen exactly as it arrived."
      >
        <div className="space-y-3">
          {doc.requests?.map((request, index) => (
            <RequestReviewCard key={index} request={request} />
          ))}
        </div>
        <RawJsonExpander
          value={{ document: doc, decisions: grant.decisions }}
        />
      </Section>

      {/* Audit tail */}
      <Section
        title="Recent requests"
        padded={false}
        actions={
          <Link href="/logs" className="btn-ghost btn-sm">
            All logs
          </Link>
        }
      >
        {auditTail.length === 0 ? (
          <p className="px-5 py-6 field-hint">
            This app hasn't made a request yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {auditTail.map((log) => (
              <li
                key={log.id}
                className="flex items-center gap-2.5 px-5 py-2 text-xs"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    log.decision === "ALLOWED"
                      ? "bg-emerald-500"
                      : log.decision === "ERROR"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                  }`}
                />
                <span className="text-slate-700 dark:text-slate-200 truncate">
                  <span className="font-mono">{log.resourceId}</span>{" "}
                  <span className="text-slate-500 dark:text-slate-400">
                    {log.action}
                  </span>
                </span>
                {log.decision !== "ALLOWED" && (
                  <span className="text-rose-600 dark:text-rose-400 truncate">
                    {log.decisionReason ??
                      log.decision.toLowerCase().replace(/_/g, " ")}
                  </span>
                )}
                {log.latencyMs !== null && (
                  <span className="text-slate-400 tabular-nums shrink-0">
                    {log.latencyMs}ms
                  </span>
                )}
                <RelativeTime
                  value={log.timestamp}
                  className="text-slate-400 ml-auto shrink-0"
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {confirmDialog}
    </main>
  );
}

/** One card per resource, its verbs listed inside. */
function groupByResource(
  permissions: PermissionRow[],
): Array<[string, PermissionRow[]]> {
  const groups = new Map<string, PermissionRow[]>();
  for (const permission of permissions) {
    const rows = groups.get(permission.resourceId) ?? [];
    rows.push(permission);
    groups.set(permission.resourceId, rows);
  }
  return [...groups.entries()];
}
