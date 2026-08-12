"use client";

// ============================================
// GRANT DOCUMENT — REVIEW MODE
// Read-only, warning-decorated rendering of a grant document.
// Used by: the approval screen, grant detail pages, and (later) the
// public builder's live preview. First member of the shared
// document-renderer family (9.2).
// ============================================

export interface GrantDocumentShape {
  specVersion?: string;
  app: {
    name: string;
    description?: string;
    homepage?: string;
    iconUrl?: string;
  };
  runtime: string;
  auth: string;
  publicKey?: string | null;
  requests: Array<{
    resource: string;
    actions: string[];
    reason: string;
    constraints?: Record<string, unknown>;
  }>;
  /** App-proposed access bundles — owner picks one (Google-consent style) */
  options?: Array<{
    id: string;
    name: string;
    description?: string;
    recommended?: boolean;
    requests: number[];
    budget?: Record<string, number | undefined>;
    duration?: string;
  }>;
  duration: string;
  renewal?: { period: string };
  budget?: Record<string, number | undefined>;
  redirectUri?: string;
}

export function hostnameOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Plain-language description of a single constraint — the approval
 * screen must read like a consent dialog, not a JSON dump.
 */
export function describeConstraint(key: string, value: unknown): string {
  switch (key) {
    case "maxOutputTokens":
      return `Replies capped at ${Number(value).toLocaleString()} tokens`;
    case "allowStreaming":
      return value === false ? "Streaming disabled" : "Streaming allowed";
    case "allowTools":
      return value === false
        ? "Tool / function calling disabled"
        : "Tool / function calling allowed";
    case "allowedModels":
      return Array.isArray(value)
        ? `Only these models: ${value.join(", ")}`
        : `Models: ${JSON.stringify(value)}`;
    case "maxRecipients":
      return `At most ${value} recipient${Number(value) === 1 ? "" : "s"} per email`;
    case "allowedFromDomains":
      return Array.isArray(value)
        ? `Can only send from: ${value.join(", ")}`
        : `From domains: ${JSON.stringify(value)}`;
    case "allowedToDomains":
      return Array.isArray(value)
        ? `Can only send to: ${value.join(", ")}`
        : `To domains: ${JSON.stringify(value)}`;
    case "allowAttachments":
      return value === false ? "Attachments disabled" : "Attachments allowed";
    case "allowHtml":
      return value === false ? "HTML email disabled" : "HTML email allowed";
    default:
      return `${key}: ${JSON.stringify(value)}`;
  }
}

/** Plain-language description of an action id. */
export function describeAction(action: string): string {
  const names: Record<string, string> = {
    "chat.completions": "Chat with AI models",
    "models.list": "List available models",
    "emails.send": "Send emails",
    send: "Send emails",
    request: "Make API requests",
  };
  return names[action] ?? action;
}

export function describeResource(resource: string): string {
  if (resource.endsWith(":*")) {
    const type = resource.slice(0, -2);
    const names: Record<string, string> = {
      llm: "Any LLM provider",
      mail: "Any mail provider",
      http: "Any HTTP API",
    };
    return names[type] ?? `Any ${type} provider`;
  }
  return resource;
}

/** App identity card: name, description, homepage domain shown explicitly. */
export function AppIdentityCard({ app }: { app: GrantDocumentShape["app"] }) {
  const domain = hostnameOf(app.homepage);
  return (
    <div className="flex items-start gap-4">
      {app.iconUrl ? (
        // Icon URLs render client-side only, no referrer, never fetched server-side
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={app.iconUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="w-14 h-14 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-semibold text-xl shrink-0">
          {app.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h2 className="font-semibold text-lg tracking-[-0.02em] text-slate-900 dark:text-white">
          {app.name}
        </h2>
        {app.description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {app.description}
          </p>
        )}
        {/* The DOMAIN, not the full URL: it's the only part of a link an
            owner can meaningfully verify at a glance. */}
        {app.homepage && (
          <a
            href={app.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 mt-2"
          >
            {domain ?? app.homepage}
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

/** One requested access, with the app's reason quoted verbatim. */
export function RequestReviewCard({
  request,
  dimmed = false,
}: {
  request: GrantDocumentShape["requests"][number];
  /** Rendered but excluded (not part of the selected access option) */
  dimmed?: boolean;
}) {
  const constraintEntries = Object.entries(request.constraints ?? {});
  return (
    <div
      className={`rounded-lg border border-slate-200 dark:border-slate-800 p-4 ${
        dimmed ? "opacity-45" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-semibold text-slate-900 dark:text-white">
          {describeResource(request.resource)}
          {!request.resource.endsWith(":*") && (
            <span className="ml-2 font-mono font-normal text-xs text-slate-400">
              {request.resource}
            </span>
          )}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {request.actions.map(describeAction).join(" · ")}
        </span>
      </div>
      <blockquote className="mt-2 pl-3 border-l-2 border-primary-400/70 dark:border-primary-500/60 text-[13px] text-slate-600 dark:text-slate-300 italic leading-relaxed">
        “{request.reason}”
      </blockquote>
      {constraintEntries.length > 0 && (
        <ul className="mt-3 space-y-1">
          {constraintEntries.map(([key, value]) => (
            <li
              key={key}
              className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5"
            >
              <svg className="w-3 h-3 mt-0.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12.75L11.25 15 15 9.75" />
              </svg>
              {describeConstraint(key, value)}
            </li>
          ))}
        </ul>
      )}
      {dimmed && (
        <p className="mt-2.5 eyebrow">Not included in the selected option</p>
      )}
    </div>
  );
}

/** Raw JSON expander shown at the bottom of review surfaces. */
export function RawJsonExpander({ value }: { value: unknown }) {
  return (
    <details className="mt-4 group">
      <summary className="field-hint cursor-pointer select-none inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300">
        <svg
          className="w-3 h-3 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        Raw document JSON
      </summary>
      <pre className="code-block mt-2">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
