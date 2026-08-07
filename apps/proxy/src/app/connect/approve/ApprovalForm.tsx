"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RequestReviewCard,
  describeResource,
  type GrantDocumentShape,
} from "@/components/document/GrantDocumentReview";
import { TokenSuccessScreen } from "./TokenSuccessScreen";

// ============================================
// GRANT APPROVAL FORM (9.3, phase-1 scope)
// Wildcard binding, auth warning matrix, duration/renewal, budgets,
// hardening accordion, approve/deny. Templates + spend projection are
// Phase 4.
// ============================================

export interface AvailableResource {
  resourceId: string;
  name: string;
  resourceType: string;
}

export interface ConnectorInfo {
  models: string[];
  pricing?: Record<string, { inputPerMTok: number; outputPerMTok: number }>;
}

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  values: {
    auth?: "bearer" | "pop";
    durationMs?: number | null;
    renewal?: { periodDays: number } | null;
    budget?: Partial<Record<"dailyRequests" | "dailyTokens" | "monthlyRequests" | "monthlyTokens", number>>;
    inactivitySuspendDays?: number;
    allowBrowser?: boolean;
  };
}

interface Props {
  grantId: string;
  document: GrantDocumentShape;
  availableResources: AvailableResource[];
  /** Per-connector model catalogs + pricing (drives spend projection) */
  connectorInfo: Record<string, ConnectorInfo>;
  /** ms value parsed from document.duration (null = forever) */
  requestedDurationMs: number | null;
  /** days parsed from document.renewal?.period */
  requestedRenewalDays: number | null;
  /** Owner's default inactivity-suspend window (admin setting) */
  defaultInactivitySuspendDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DURATION_OPTIONS: Array<{ label: string; ms: number | null }> = [
  { label: "24 hours", ms: DAY_MS },
  { label: "7 days", ms: 7 * DAY_MS },
  { label: "30 days", ms: 30 * DAY_MS },
  { label: "90 days", ms: 90 * DAY_MS },
  { label: "1 year", ms: 365 * DAY_MS },
  { label: "Forever", ms: null },
];

export default function ApprovalForm({
  grantId,
  document: doc,
  availableResources,
  connectorInfo,
  requestedDurationMs,
  requestedRenewalDays,
  defaultInactivitySuspendDays,
}: Props) {
  const popAvailable = !!doc.publicKey;

  const [auth, setAuth] = useState<"bearer" | "pop">(
    doc.auth === "pop" && popAvailable ? "pop" : "bearer",
  );
  const initialDurationMs = requestedDurationMs ?? 30 * DAY_MS;
  const [durationMs, setDurationMs] = useState<number | null>(initialDurationMs);
  // If the app asked for a non-preset duration, surface it as an explicit
  // option — otherwise the select would show "24 hours" while state holds
  // something else (silent over-granting).
  const durationOptions = useMemo(() => {
    if (DURATION_OPTIONS.some((option) => option.ms === initialDurationMs)) {
      return DURATION_OPTIONS;
    }
    const days = Math.max(1, Math.round(initialDurationMs / DAY_MS));
    return [
      { label: `As requested (~${days} days)`, ms: initialDurationMs },
      ...DURATION_OPTIONS,
    ];
  }, [initialDurationMs]);
  const [renewable, setRenewable] = useState(requestedRenewalDays !== null);
  const [renewalDays, setRenewalDays] = useState(requestedRenewalDays ?? 30);
  const [budget, setBudget] = useState({
    dailyRequests: doc.budget?.dailyRequests?.toString() ?? "",
    dailyTokens: doc.budget?.dailyTokens?.toString() ?? "",
    monthlyRequests: doc.budget?.monthlyRequests?.toString() ?? "",
    monthlyTokens: doc.budget?.monthlyTokens?.toString() ?? "",
  });
  const [loosenedAck, setLoosenedAck] = useState(false);
  const [egressIps, setEgressIps] = useState("");
  const [allowBrowser, setAllowBrowser] = useState(doc.runtime === "browser");
  const [inactivityDays, setInactivityDays] = useState(
    String(defaultInactivitySuspendDays),
  );

  // Wildcard bindings: request index → selected resource ids
  const wildcardRequests = doc.requests
    .map((request, index) => ({ request, index }))
    .filter(({ request }) => request.resource.endsWith(":*"));

  const [bindings, setBindings] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const { request, index } of wildcardRequests) {
      const type = request.resource.slice(0, -2);
      initial[String(index)] = availableResources
        .filter((r) => r.resourceType === type)
        .map((r) => r.resourceId);
    }
    return initial;
  });

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  useEffect(() => {
    // Templates are owner data; the dropdown hides when not logged in
    fetch("/api/admin/templates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setTemplates(data.templates ?? []))
      .catch(() => {});
  }, []);

  const applyTemplate = (template: TemplateRow) => {
    const v = template.values;
    if (v.auth && (v.auth !== "pop" || popAvailable)) setAuth(v.auth);
    if (v.durationMs !== undefined) setDurationMs(v.durationMs);
    if (v.renewal !== undefined) {
      setRenewable(!!v.renewal);
      if (v.renewal) setRenewalDays(v.renewal.periodDays);
    }
    if (v.budget) {
      setBudget({
        dailyRequests: v.budget.dailyRequests?.toString() ?? "",
        dailyTokens: v.budget.dailyTokens?.toString() ?? "",
        monthlyRequests: v.budget.monthlyRequests?.toString() ?? "",
        monthlyTokens: v.budget.monthlyTokens?.toString() ?? "",
      });
    }
    if (v.inactivitySuspendDays !== undefined) {
      setInactivityDays(String(v.inactivitySuspendDays));
    }
    if (v.allowBrowser !== undefined) setAllowBrowser(v.allowBrowser);
  };

  const saveAsTemplate = async () => {
    const name = prompt("Template name:");
    if (!name) return;
    await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        values: {
          auth,
          durationMs,
          renewal: renewable ? { periodDays: renewalDays } : null,
          budget: Object.fromEntries(
            Object.entries(budget)
              .filter(([, value]) => value.trim() !== "")
              .map(([key, value]) => [key, parseInt(value, 10)]),
          ),
          inactivitySuspendDays: parseInt(inactivityDays || "0", 10),
          allowBrowser,
        },
      }),
    });
    const res = await fetch("/api/admin/templates");
    if (res.ok) setTemplates((await res.json()).templates ?? []);
  };

  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [finished, setFinished] = useState<"approved" | "denied" | null>(null);

  // ---- Warning matrix (5.3) ----
  const bearerWarning = useMemo(() => {
    if (auth !== "bearer") return null;
    if (renewable && renewalDays <= 31) return "renewable" as const;
    if (durationMs !== null && durationMs <= 7 * DAY_MS) return null;
    return "long-lived" as const;
  }, [auth, durationMs, renewable, renewalDays]);

  // ---- Loosening detection: budgets above what the app asked for ----
  const loosened = useMemo(() => {
    const fields: Array<[keyof typeof budget, number | undefined]> = [
      ["dailyRequests", doc.budget?.dailyRequests],
      ["dailyTokens", doc.budget?.dailyTokens],
      ["monthlyRequests", doc.budget?.monthlyRequests],
      ["monthlyTokens", doc.budget?.monthlyTokens],
    ];
    return fields.some(([key, requested]) => {
      if (requested === undefined) return false;
      const value = budget[key].trim();
      if (value === "") return true; // removing a requested cap = loosening
      return parseInt(value, 10) > requested;
    });
  }, [budget, doc.budget]);

  // ---- Spend projection (5.7): worst-case per bound LLM connector ----
  const spendProjection = useMemo(() => {
    const boundResources = [
      ...new Set(
        doc.requests.flatMap((request, index) =>
          request.resource.endsWith(":*")
            ? (bindings[String(index)] ?? [])
            : [request.resource],
        ),
      ),
    ].filter((id) => id.startsWith("llm:"));

    const dailyTokens = parseInt(budget.dailyTokens || "0", 10) || null;
    const dailyRequests = parseInt(budget.dailyRequests || "0", 10) || null;

    const rows = boundResources.map((resourceId) => {
      const info = connectorInfo[resourceId];
      if (!info?.pricing || Object.keys(info.pricing).length === 0) {
        return { resourceId, perDay: null as number | null };
      }
      // Allowed models = request constraints allowedModels ∩ catalog, else catalog
      const requestConstraints = doc.requests.find((request, index) => {
        const bound = request.resource.endsWith(":*")
          ? (bindings[String(index)] ?? [])
          : [request.resource];
        return bound.includes(resourceId);
      })?.constraints as { allowedModels?: string[]; maxOutputTokens?: number } | undefined;
      const models =
        requestConstraints?.allowedModels?.length
          ? requestConstraints.allowedModels
          : Object.keys(info.pricing);
      const maxRate = Math.max(
        0,
        ...models.map((model) => info.pricing?.[model]?.outputPerMTok ?? 0),
      );
      if (maxRate === 0) return { resourceId, perDay: null };

      let perDay: number | null = null;
      if (dailyTokens) {
        // Conservative bound: all tokens at the priciest output rate
        perDay = (dailyTokens * maxRate) / 1_000_000;
      } else if (dailyRequests) {
        const maxOut = requestConstraints?.maxOutputTokens ?? 4096;
        perDay = (dailyRequests * maxOut * maxRate) / 1_000_000;
      }
      return { resourceId, perDay };
    });

    const known = rows.filter((row) => row.perDay !== null);
    const total = known.reduce((sum, row) => sum + (row.perDay ?? 0), 0);
    const unbounded = !dailyTokens && !dailyRequests;
    return { rows, total, unbounded, hasKnown: known.length > 0 };
  }, [doc.requests, bindings, budget.dailyTokens, budget.dailyRequests, connectorInfo]);

  const bindingIncomplete = wildcardRequests.some(
    ({ index }) => (bindings[String(index)] ?? []).length === 0,
  );

  const expiryDate = durationMs
    ? new Date(Date.now() + durationMs).toLocaleDateString()
    : "never";

  async function submit(decision: "approve" | "deny") {
    setSubmitting(decision);
    setError(null);
    try {
      const budgetNumbers = Object.fromEntries(
        Object.entries(budget)
          .filter(([, v]) => v.trim() !== "")
          .map(([k, v]) => [k, parseInt(v, 10)]),
      );

      const response = await fetch("/api/connect/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: grantId,
          decision,
          ...(decision === "approve" && {
            decisions: {
              bindings,
              auth,
              durationMs,
              renewal: renewable ? { periodDays: renewalDays } : null,
              ...(Object.keys(budgetNumbers).length > 0 && {
                budget: budgetNumbers,
              }),
              ...(egressIps.trim() && { egressIps: egressIps.trim() }),
              allowBrowser,
              inactivitySuspendDays: parseInt(inactivityDays || "0", 10),
              ...(loosened && { loosenedAcknowledged: true }),
            },
          }),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        // Surface field-level validation details instead of discarding them
        const details = Array.isArray(data.details)
          ? (data.details as Array<{ path: string; message: string }>)
              .map((detail) => `${detail.path}: ${detail.message}`)
              .join("\n")
          : "";
        throw new Error(
          [data.error || "Request failed", details]
            .filter(Boolean)
            .join("\n"),
        );
      }

      if (decision === "deny") {
        setFinished("denied");
        return;
      }

      if (data.redirectUri) {
        window.location.href = data.redirectUri;
        return;
      }
      if (data.token) {
        setIssuedToken(data.token);
        return;
      }
      setFinished("approved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(null);
    }
  }

  if (issuedToken) {
    return (
      <TokenSuccessScreen
        token={issuedToken}
        appName={doc.app.name}
        boundResources={[
          ...new Set(
            doc.requests.flatMap((request, index) =>
              request.resource.endsWith(":*")
                ? (bindings[String(index)] ?? [])
                : [request.resource],
            ),
          ),
        ]}
      />
    );
  }

  if (finished) {
    return (
      <div className="text-center py-8">
        <p className="text-lg font-semibold text-slate-900 dark:text-white">
          {finished === "approved" ? "Access granted" : "Request denied"}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          {finished === "approved"
            ? `${doc.app.name} can now connect with its signing keys.`
            : `${doc.app.name} was told the connection was declined.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Requests with reasons */}
      <section>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
          Requested access
        </h3>
        <div className="space-y-3">
          {doc.requests.map((request, index) => (
            <div key={index}>
              <RequestReviewCard request={request} />
              {request.resource.endsWith(":*") && (
                <div className="mt-2 ml-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Bind “{describeResource(request.resource)}” to:
                  </p>
                  {availableResources.filter(
                    (r) => r.resourceType === request.resource.slice(0, -2),
                  ).length === 0 ? (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      No configured providers of this type — add credentials
                      first.
                    </p>
                  ) : (
                    availableResources
                      .filter(
                        (r) =>
                          r.resourceType === request.resource.slice(0, -2),
                      )
                      .map((resource) => (
                        <label
                          key={resource.resourceId}
                          className="flex items-center gap-2 text-sm py-0.5 text-slate-700 dark:text-slate-200"
                        >
                          <input
                            type="checkbox"
                            checked={(
                              bindings[String(index)] ?? []
                            ).includes(resource.resourceId)}
                            onChange={(e) => {
                              setBindings((prev) => {
                                const current = prev[String(index)] ?? [];
                                return {
                                  ...prev,
                                  [String(index)]: e.target.checked
                                    ? [...current, resource.resourceId]
                                    : current.filter(
                                        (id) => id !== resource.resourceId,
                                      ),
                                };
                              });
                            }}
                          />
                          <span className="font-mono">
                            {resource.resourceId}
                          </span>
                          <span className="text-slate-400">
                            ({resource.name})
                          </span>
                        </label>
                      ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Templates */}
      {templates.length > 0 && (
        <section className="flex items-center gap-2 flex-wrap">
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Template:
          </label>
          <select
            className="input text-sm"
            value={selectedTemplate}
            onChange={(e) => {
              setSelectedTemplate(e.target.value);
              const template = templates.find((t) => t.id === e.target.value);
              if (template) applyTemplate(template);
            }}
          >
            <option value="">— none —</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.description ? ` — ${template.description}` : ""}
              </option>
            ))}
          </select>
          <button
            className="text-xs text-primary-600 dark:text-primary-400 underline"
            onClick={saveAsTemplate}
          >
            Save current as template
          </button>
        </section>
      )}

      {/* Auth */}
      <section>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
          Authentication
        </h3>
        <div className="flex gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="radio"
              checked={auth === "bearer"}
              onChange={() => setAuth("bearer")}
            />
            Static token (no code changes in the app)
          </label>
          <label
            className={`flex items-center gap-2 text-sm ${popAvailable ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-600"}`}
          >
            <input
              type="radio"
              checked={auth === "pop"}
              disabled={!popAvailable}
              onChange={() => setAuth("pop")}
            />
            PoP signing keys
            {!popAvailable && (
              <span className="text-xs">
                (unavailable — the app sent no public key)
              </span>
            )}
          </label>
        </div>
        {bearerWarning === "long-lived" && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            A leaked token is silently usable until {expiryDate}. For
            long-lived access, PoP keeps the credential out of every request
            and log. Continue with a static token?
          </div>
        )}
        {bearerWarning === "renewable" && (
          <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
            Renewable grant: the token only lives until the current period
            ends, and lapses unless you renew.
          </div>
        )}
      </section>

      {/* Duration & renewal */}
      <section>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
          Duration
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="input text-sm"
            value={String(durationMs)}
            onChange={(e) =>
              setDurationMs(
                e.target.value === "null" ? null : parseInt(e.target.value, 10),
              )
            }
          >
            {durationOptions.map((option) => (
              <option key={option.label} value={String(option.ms)}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={renewable}
              onChange={(e) => setRenewable(e.target.checked)}
            />
            Renewable every
          </label>
          <input
            type="number"
            min={1}
            disabled={!renewable}
            className="input text-sm w-20"
            value={renewalDays}
            onChange={(e) => {
              const parsed = parseInt(e.target.value || "30", 10);
              setRenewalDays(Number.isNaN(parsed) ? 30 : Math.max(1, parsed));
            }}
          />
          <span className="text-sm text-slate-500">days</span>
        </div>
      </section>

      {/* Budgets */}
      <section>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
          Budgets{" "}
          <span className="font-normal text-xs text-slate-500">
            (prefilled from the request — tighten freely)
          </span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              ["dailyRequests", "Daily requests"],
              ["dailyTokens", "Daily tokens"],
              ["monthlyRequests", "Monthly requests"],
              ["monthlyTokens", "Monthly tokens"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {label}
              </span>
              <input
                type="number"
                min={1}
                placeholder="unlimited"
                className="input text-sm w-full mt-1"
                value={budget[key]}
                onChange={(e) =>
                  setBudget((prev) => ({ ...prev, [key]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        {!budget.dailyRequests &&
          !budget.dailyTokens &&
          !budget.monthlyRequests &&
          !budget.monthlyTokens && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              No budget caps set — this grant will be unlimited. Consider a
              daily cap.
            </p>
          )}
        {loosened && (
          <label className="mt-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={loosenedAck}
              onChange={(e) => setLoosenedAck(e.target.checked)}
            />
            These limits exceed what the app asked for — I want that.
          </label>
        )}
      </section>

      {/* Spend projection (5.7) */}
      <section className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
          Spend projection
        </h3>
        {spendProjection.unbounded ? (
          <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
            $0 possible? Verify caps — no daily budget fields are set, so
            worst-case spend is unbounded.
          </p>
        ) : spendProjection.hasKnown ? (
          <>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Worst case ≈ ${spendProjection.total.toFixed(2)}/day (≈ $
              {(spendProjection.total * 30).toFixed(0)}/month) on your keys.
            </p>
            <ul className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {spendProjection.rows.map((row) => (
                <li key={row.resourceId}>
                  {row.resourceId}:{" "}
                  {row.perDay !== null
                    ? `≈ $${row.perDay.toFixed(2)}/day`
                    : "no pricing data"}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            No pricing data for the bound connectors — no estimate.
          </p>
        )}
      </section>

      {/* Hardening */}
      <details
        open={doc.runtime === "server"}
        className="rounded-lg border border-slate-200 dark:border-slate-700 p-4"
      >
        <summary className="text-sm font-semibold text-slate-900 dark:text-white cursor-pointer select-none">
          Hardening
        </summary>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Egress IP allowlist{" "}
              {doc.runtime === "server" &&
                "(recommended — this app runs on a server with stable IPs)"}
            </span>
            <textarea
              rows={2}
              placeholder={"203.0.113.7\n198.51.100.0/24"}
              className="input text-sm w-full mt-1 font-mono"
              value={egressIps}
              onChange={(e) => setEgressIps(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={allowBrowser}
              onChange={(e) => setAllowBrowser(e.target.checked)}
            />
            Allow browser-originated requests
          </label>
          {allowBrowser && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Anyone who can run JavaScript against this grant's token can use
              it from any website. Only enable for browser-runtime apps you
              trust.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            Suspend after
            <input
              type="number"
              min={0}
              className="input text-sm w-20"
              value={inactivityDays}
              onChange={(e) => setInactivityDays(e.target.value)}
            />
            days of inactivity (0 = never)
          </label>
        </div>
      </details>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 whitespace-pre-line">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          className="btn-primary flex-1"
          disabled={
            submitting !== null ||
            bindingIncomplete ||
            (loosened && !loosenedAck)
          }
          onClick={() => submit("approve")}
        >
          {submitting === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          className="btn-secondary flex-1"
          disabled={submitting !== null}
          onClick={() => submit("deny")}
        >
          {submitting === "deny" ? "Denying…" : "Deny"}
        </button>
      </div>
      {bindingIncomplete && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Every “any provider” request must be bound to at least one
          configured provider.
        </p>
      )}
    </div>
  );
}
