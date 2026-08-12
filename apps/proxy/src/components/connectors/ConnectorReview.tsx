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
  builtin: { label: "Built-in", className: "badge-success" },
  registry: { label: "Marketplace", className: "badge-success" },
  url: { label: "Unverified URL", className: "badge-warning" },
  custom: { label: "Custom", className: "badge-neutral" },
};

export function TrustBadge({ trust }: { trust: TrustLevel }) {
  const badge = TRUST_BADGES[trust];
  return (
    <span className={`${badge.className} shrink-0`}>
      {trust === "url" && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      )}
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
      {/* (1) Egress hosts banner — large, top. This is the one fact that
          can't be undone after install, so it outranks everything else. */}
      <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
        <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
          Your “{credentialLabel}” will be sent to these hosts:
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {(doc.allowedHosts ?? []).map((host) => (
            <code
              key={host}
              className={`px-2 py-1 rounded-md text-[13px] font-mono ${
                highlightHosts?.includes(host)
                  ? "bg-rose-600 text-white font-semibold"
                  : "bg-white dark:bg-slate-900 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30"
              }`}
            >
              {host}
              {highlightHosts?.includes(host) && " · NEW"}
            </code>
          ))}
        </div>
        <p className="mt-2.5 text-xs text-rose-700 dark:text-rose-400">
          Requests from this connector can only go to these hosts — the list is
          frozen at install.
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
