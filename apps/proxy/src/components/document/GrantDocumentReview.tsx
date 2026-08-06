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
  legacy?: boolean;
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
          className="w-14 h-14 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary-500/25 flex-shrink-0">
          {app.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h2 className="font-semibold text-lg text-slate-900 dark:text-white">
          {app.name}
        </h2>
        {app.description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {app.description}
          </p>
        )}
        {app.homepage && (
          <a
            href={app.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 mt-2"
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
}: {
  request: GrantDocumentShape["requests"][number];
}) {
  const constraintEntries = Object.entries(request.constraints ?? {});
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
          {describeResource(request.resource)}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {request.actions.join(", ")}
        </span>
      </div>
      <blockquote className="mt-2 pl-3 border-l-2 border-primary-400 text-sm text-slate-600 dark:text-slate-300 italic">
        “{request.reason}”
      </blockquote>
      {constraintEntries.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
          {constraintEntries.map(([key, value]) => (
            <div key={key} className="text-xs">
              <dt className="inline text-slate-500 dark:text-slate-400">
                {key}:{" "}
              </dt>
              <dd className="inline font-mono text-slate-700 dark:text-slate-200">
                {JSON.stringify(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Raw JSON expander shown at the bottom of review surfaces. */
export function RawJsonExpander({ value }: { value: unknown }) {
  return (
    <details className="mt-4">
      <summary className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
        Raw document JSON
      </summary>
      <pre className="mt-2 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs overflow-x-auto text-slate-700 dark:text-slate-200">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
