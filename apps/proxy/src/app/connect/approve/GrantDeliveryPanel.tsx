"use client";

import { useState } from "react";
import { CopyButton } from "@/components/ui";
import { TokenDeliveryDetails } from "./TokenDeliveryDetails";

// ============================================
// GRANT DELIVERY PANEL
// One shape for every outcome, instead of three screens picked by
// runtime/redirectUri branching the owner never sees. The server
// always hands back whatever it was able to produce — a redirect, a
// token, both, or neither (PoP with no redirect needs nothing
// delivered) — and this panel just shows what's there:
//
//   - a redirect, if the app gave us a redirectUri: shown as a
//     copyable URL with a manual "Grant →" open, so it still works for
//     an app that can't (or didn't) receive the auto-opened tab —
//     popup blockers are common enough that "attempt + visible manual
//     fallback" beats trusting the auto-open alone.
//   - a raw token, if this is a bearer grant: tucked under "Other ways
//     to deliver this" when a redirect is also available (the
//     redirect is the easier path), promoted to the primary — and
//     auto-expanded — spot when it's the only option at all.
// ============================================

interface Props {
  appName: string;
  auth: "pop" | "bearer";
  redirectUri?: string;
  token?: string;
  boundResources: string[];
}

export function GrantDeliveryPanel({
  appName,
  auth,
  redirectUri,
  token,
  boundResources,
}: Props) {
  const [opened, setOpened] = useState(false);

  const openRedirect = () => {
    if (!redirectUri) return;
    window.open(redirectUri, "_blank", "noopener,noreferrer");
    setOpened(true);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          Access granted
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
          {appName} can now connect{" "}
          {auth === "pop" ? "with its signing keys" : "with the token below"}.
        </p>
      </div>

      {redirectUri && (
        <div className="space-y-1.5">
          <p className="eyebrow">Hand it back to {appName}</p>
          <div className="code-block flex flex-col sm:flex-row sm:items-center gap-2.5">
            <code
              className="flex-1 min-w-0 text-xs text-slate-300 truncate select-all"
              title={redirectUri}
            >
              {redirectUri}
            </code>
            <div className="flex gap-2 shrink-0">
              <CopyButton value={redirectUri} className="btn-secondary btn-sm" />
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={openRedirect}
              >
                Grant →
              </button>
            </div>
          </div>
          <p className="field-hint">
            {opened ? "Opened in a new tab — didn't land anywhere useful? " : ""}
            Copy the link above for anything that isn't a browser tab (a CLI,
            a notebook, a blocked pop-up).
          </p>
        </div>
      )}

      {(token || !redirectUri) && (
        <details className="group" open={!redirectUri || undefined}>
          <summary className="flex items-center gap-2 cursor-pointer select-none list-none">
            <svg
              className="w-3 h-3 shrink-0 text-slate-400 transition-transform group-open:rotate-90"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
              {redirectUri ? "Other ways to deliver this" : "Copy-paste delivery"}
            </span>
          </summary>
          <div className="mt-4">
            {token ? (
              <TokenDeliveryDetails token={token} boundResources={boundResources} />
            ) : (
              <p className="field-hint">
                This app authenticates with its own signing key — there's
                nothing else to hand off.
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
