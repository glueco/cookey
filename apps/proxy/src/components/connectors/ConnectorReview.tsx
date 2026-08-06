"use client";

import { RawJsonExpander } from "@/components/document/GrantDocumentReview";

// ============================================
// CONNECTOR INSTALL REVIEW (9.4)
// Order is a product requirement, not a suggestion:
// (1) egress hosts banner, (2) trust badge, (3) credentials requested,
// (4) actions + enforcement, (5) models/pricing, (6) raw JSON expander.
// ============================================

export interface ConnectorDocShape {
  id: string;
  name: string;
  version: string;
  description?: string;
  homepage?: string;
  resourceType: string;
  adapter: string;
  config: Record<string, unknown>;
  allowedHosts?: string[];
  actions: Record<
    string,
    {
      method: string;
      path?: string;
      pathPattern?: string;
      streaming?: boolean;
      enforce?: Record<string, unknown>;
    }
  >;
  models?: string[];
  pricing?: Record<string, { inputPerMTok: number; outputPerMTok: number }>;
  credentials?: Array<{
    name: string;
    type: string;
    label: string;
    required?: boolean;
  }>;
}

export type TrustLevel = "builtin" | "registry" | "url" | "custom";

const TRUST_BADGES: Record<TrustLevel, { label: string; className: string }> = {
  builtin: {
    label: "Built-in",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  registry: {
    label: "Official marketplace",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  url: {
    label: "⚠ Unverified URL",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  custom: {
    label: "Custom",
    className:
      "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  },
};

export function TrustBadge({ trust }: { trust: TrustLevel }) {
  const badge = TRUST_BADGES[trust];
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

export function ConnectorReview({
  document: doc,
  trust,
  highlightHosts,
}: {
  document: ConnectorDocShape;
  trust: TrustLevel;
  /** Hosts to highlight red (update flow: newly added hosts) */
  highlightHosts?: string[];
}) {
  const credentialLabel =
    doc.credentials?.find((c) => c.type === "secret")?.label ??
    "API credential";

  return (
    <div className="space-y-5">
      {/* (1) Egress hosts banner — large, top */}
      <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900">
        <p className="text-sm font-semibold text-red-900 dark:text-red-200">
          Your “{credentialLabel}” will be sent to these hosts:
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(doc.allowedHosts ?? []).map((host) => (
            <code
              key={host}
              className={`px-2 py-1 rounded text-sm font-mono ${
                highlightHosts?.includes(host)
                  ? "bg-red-600 text-white"
                  : "bg-white dark:bg-slate-900 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900"
              }`}
            >
              {host}
              {highlightHosts?.includes(host) && " (NEW)"}
            </code>
          ))}
        </div>
        <p className="mt-2 text-xs text-red-700 dark:text-red-400">
          Requests from this connector can ONLY go to these hosts — the list
          is frozen at install.
        </p>
      </div>

      {/* (2) Trust badge + identity */}
      <div className="flex items-center gap-3">
        <TrustBadge trust={trust} />
        <span className="font-semibold text-slate-900 dark:text-white">
          {doc.name}
        </span>
        <span className="text-xs text-slate-500">
          {doc.id} · v{doc.version} · adapter: {doc.adapter}
        </span>
      </div>
      {doc.description && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {doc.description}
        </p>
      )}

      {/* (3) Credentials requested */}
      <section>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
          Credentials it will ask for
        </h4>
        {doc.credentials?.length ? (
          <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-0.5">
            {doc.credentials.map((cred) => (
              <li key={cred.name}>
                • {cred.label}{" "}
                <span className="text-xs text-slate-400">
                  ({cred.type}
                  {cred.required === false ? ", optional" : ""})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">None declared.</p>
        )}
      </section>

      {/* (4) Actions + enforcement summary */}
      <section>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
          Actions and enforcement
        </h4>
        <div className="space-y-2">
          {Object.entries(doc.actions).map(([actionId, action]) => (
            <div
              key={actionId}
              className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-sm"
            >
              <span className="font-mono text-slate-900 dark:text-white">
                {actionId}
              </span>{" "}
              <span className="text-xs text-slate-500">
                {action.method} {action.path ?? action.pathPattern}
                {action.streaming ? " · streaming" : ""}
              </span>
              {action.enforce && Object.keys(action.enforce).length > 0 ? (
                <p className="text-xs text-slate-500 mt-1">
                  Enforces: {Object.keys(action.enforce).join(", ")}
                </p>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  No body-level enforcement (request limits still apply)
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* (5) Models + pricing */}
      {doc.models && doc.models.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            Models
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {doc.models.map((model) => (
              <span
                key={model}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300"
              >
                {model}
                {doc.pricing?.[model] &&
                  ` · $${doc.pricing[model].outputPerMTok}/M out`}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* (6) Raw JSON */}
      <RawJsonExpander value={doc} />
    </div>
  );
}
