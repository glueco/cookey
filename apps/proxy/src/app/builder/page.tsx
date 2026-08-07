"use client";

import { useMemo, useState } from "react";
import {
  AppIdentityCard,
  RequestReviewCard,
} from "@/components/document/GrantDocumentReview";

// ============================================
// GRANT BUILDER (9.7) — public, unauthenticated, purely client-side.
// Form on the left; live outputs on the right: the grant JSON, a
// preview of what the owner's approval screen will show (same review
// components — that's the point), and copy-paste snippets.
// No data leaves this page.
// ============================================

interface RequestRow {
  resource: string;
  actions: string;
  reason: string;
  maxOutputTokens: string;
  allowStreaming: boolean;
}

export default function GrantBuilderPage() {
  const [appName, setAppName] = useState("My App");
  const [appDescription, setAppDescription] = useState("");
  const [homepage, setHomepage] = useState("");
  const [runtime, setRuntime] = useState("server");
  const [auth, setAuth] = useState<"bearer" | "pop">("bearer");
  const [publicKey, setPublicKey] = useState("");
  const [duration, setDuration] = useState("30d");
  const [renewable, setRenewable] = useState(false);
  const [renewalPeriod, setRenewalPeriod] = useState("30d");
  const [dailyRequests, setDailyRequests] = useState("200");
  const [dailyTokens, setDailyTokens] = useState("100000");
  const [redirectUri, setRedirectUri] = useState("");
  const [requests, setRequests] = useState<RequestRow[]>([
    {
      resource: "llm:*",
      actions: "chat.completions",
      reason: "",
      maxOutputTokens: "1024",
      allowStreaming: true,
    },
  ]);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<"json" | "preview" | "snippets">("json");

  const document = useMemo(() => {
    const doc: Record<string, unknown> = {
      specVersion: "1",
      app: {
        name: appName || "My App",
        ...(appDescription && { description: appDescription }),
        ...(homepage && { homepage }),
      },
      runtime,
      auth,
      ...(auth === "pop" && { publicKey: publicKey.trim() }),
      requests: requests.map((row) => ({
        resource: row.resource,
        actions: row.actions.split(",").map((a) => a.trim()).filter(Boolean),
        reason: row.reason || "…explain why your app needs this…",
        constraints: {
          ...(row.maxOutputTokens && {
            maxOutputTokens: parseInt(row.maxOutputTokens, 10),
          }),
          ...(row.allowStreaming === false && { allowStreaming: false }),
        },
      })),
      duration,
      ...(renewable && { renewal: { period: renewalPeriod } }),
      budget: {
        ...(dailyRequests && { dailyRequests: parseInt(dailyRequests, 10) }),
        ...(dailyTokens && { dailyTokens: parseInt(dailyTokens, 10) }),
      },
      ...(redirectUri && { redirectUri }),
    };
    return doc;
  }, [appName, appDescription, homepage, runtime, auth, publicKey, duration, renewable, renewalPeriod, dailyRequests, dailyTokens, redirectUri, requests]);

  const json = JSON.stringify(document, null, 2);

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const bearerSnippet = `# Any OpenAI SDK works — no Cookey code needed
import os

from openai import OpenAI
client = OpenAI(
    base_url="https://YOUR-GATEWAY/r/llm/<provider>/v1",
    api_key=os.environ["COOKEY_TOKEN"],   # ck_… from the approval screen
)`;

  const popSnippet = `import { generateKeyPair, submitGrant } from "@glueco/sdk";

const { seedBase64, publicKeyBase64 } = await generateKeyPair();
// store seedBase64 as GLUECO_PRIVATE_KEY, put publicKeyBase64 in the grant
const { approvalUrl } = await submitGrant({
  pairingString: "pair::https://YOUR-GATEWAY::<code>",
  grant: ${json.split("\n").join("\n  ")},
});`;

  return (
    <main className="min-h-screen max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Grant builder
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Describe what your app needs from a Cookey gateway. Everything runs
          in your browser — nothing is sent anywhere.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* ---- Form ---- */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              App name
              <input className="input w-full mt-1 text-sm" value={appName} onChange={(e) => setAppName(e.target.value)} />
            </label>
            <label className="block text-sm">
              Homepage
              <input className="input w-full mt-1 text-sm" placeholder="https://…" value={homepage} onChange={(e) => setHomepage(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm">
            Description
            <input className="input w-full mt-1 text-sm" placeholder="What the app does — owners see this" value={appDescription} onChange={(e) => setAppDescription(e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              Runtime
              <select className="input w-full mt-1 text-sm" value={runtime} onChange={(e) => setRuntime(e.target.value)}>
                <option value="server">server</option>
                <option value="serverless">serverless</option>
                <option value="cli">cli</option>
                <option value="browser">browser</option>
              </select>
            </label>
            <label className="block text-sm">
              Auth
              <select className="input w-full mt-1 text-sm" value={auth} onChange={(e) => setAuth(e.target.value as "bearer" | "pop")}>
                <option value="bearer">bearer (no SDK needed)</option>
                <option value="pop">pop (long-lived, needs SDK)</option>
              </select>
            </label>
          </div>

          {auth === "pop" && (
            <label className="block text-sm">
              Public key (base64 Ed25519)
              <input className="input w-full mt-1 text-sm font-mono" placeholder="MCowBQYDK2VwAyEA…" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} />
              {publicKey.trim().length < 40 && (
                <span className="block mt-1 text-xs text-amber-600 dark:text-amber-400">
                  paste your app's base64 Ed25519 public key — the document is invalid without it
                </span>
              )}
            </label>
          )}

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Requests</p>
            {requests.map((row, index) => (
              <div key={index} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs text-slate-500">
                    Resource (id or wildcard)
                    <input className="input w-full mt-1 text-sm font-mono" value={row.resource} placeholder="llm:* or llm:groq" onChange={(e) => setRequests((prev) => prev.map((r, i) => (i === index ? { ...r, resource: e.target.value } : r)))} />
                  </label>
                  <label className="block text-xs text-slate-500">
                    Actions (comma-separated)
                    <input className="input w-full mt-1 text-sm font-mono" value={row.actions} onChange={(e) => setRequests((prev) => prev.map((r, i) => (i === index ? { ...r, actions: e.target.value } : r)))} />
                  </label>
                </div>
                <label className="block text-xs text-slate-500">
                  Reason (required — the owner reads this verbatim)
                  <input className="input w-full mt-1 text-sm" placeholder="Runs the AI players each game round." value={row.reason} onChange={(e) => setRequests((prev) => prev.map((r, i) => (i === index ? { ...r, reason: e.target.value } : r)))} />
                  {!row.reason.trim() && (
                    <span className="block mt-1 text-xs text-amber-600 dark:text-amber-400">
                      a reason is required — the gateway rejects requests without one
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-3">
                  <label className="block text-xs text-slate-500">
                    Max output tokens
                    <input type="number" className="input w-24 mt-1 text-sm" value={row.maxOutputTokens} onChange={(e) => setRequests((prev) => prev.map((r, i) => (i === index ? { ...r, maxOutputTokens: e.target.value } : r)))} />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-500 mt-4">
                    <input type="checkbox" checked={row.allowStreaming} onChange={(e) => setRequests((prev) => prev.map((r, i) => (i === index ? { ...r, allowStreaming: e.target.checked } : r)))} />
                    streaming
                  </label>
                  {requests.length > 1 && (
                    <button className="text-red-500 text-xs mt-4 ml-auto" onClick={() => setRequests((prev) => prev.filter((_, i) => i !== index))}>
                      remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button className="text-xs text-primary-600 underline" onClick={() => setRequests((prev) => [...prev, { resource: "llm:*", actions: "chat.completions", reason: "", maxOutputTokens: "", allowStreaming: true }])}>
              + add request
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block text-sm">
              Duration
              <select className="input w-full mt-1 text-sm" value={duration} onChange={(e) => setDuration(e.target.value)}>
                {["24h", "7d", "30d", "90d", "1y", "forever"].map((d) => (<option key={d}>{d}</option>))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="flex items-center gap-1">
                <input type="checkbox" checked={renewable} onChange={(e) => setRenewable(e.target.checked)} />
                Renewable
              </span>
              <select className="input w-full mt-1 text-sm" disabled={!renewable} value={renewalPeriod} onChange={(e) => setRenewalPeriod(e.target.value)}>
                {["7d", "30d", "90d"].map((d) => (<option key={d}>{d}</option>))}
              </select>
            </label>
            <label className="block text-sm">
              Daily requests
              <input type="number" className="input w-full mt-1 text-sm" value={dailyRequests} onChange={(e) => setDailyRequests(e.target.value)} />
            </label>
            <label className="block text-sm">
              Daily tokens
              <input type="number" className="input w-full mt-1 text-sm" value={dailyTokens} onChange={(e) => setDailyTokens(e.target.value)} />
            </label>
          </div>

          <label className="block text-sm">
            Redirect URI <span className="text-xs text-slate-400">(optional — enables claim-code token delivery)</span>
            <input className="input w-full mt-1 text-sm" placeholder="https://myapp.example/callback" value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} />
          </label>
        </div>

        {/* ---- Outputs ---- */}
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["json", "preview", "snippets"] as const).map((t) => (
              <button
                key={t}
                className={`px-3 py-1 rounded-full text-xs font-medium ${tab === t ? "bg-primary-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}
                onClick={() => setTab(t)}
              >
                {t === "json" ? "grant.json" : t === "preview" ? "Owner preview" : "Snippets"}
              </button>
            ))}
          </div>

          {tab === "json" && (
            <div className="relative">
              <pre className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs overflow-x-auto text-slate-700 dark:text-slate-200">
                {json}
              </pre>
              <button className="absolute top-2 right-2 btn-secondary text-xs" onClick={() => copy("json", json)}>
                {copied === "json" ? "Copied!" : "Copy"}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Host this at <code>/.well-known/cookey-grant.json</code> so
                owners can add your app by URL, or submit it with a pairing
                code via <code>POST /api/connect/prepare</code>.
              </p>
            </div>
          )}

          {tab === "preview" && (
            <div className="card p-4 space-y-4">
              <p className="text-xs text-slate-400 uppercase tracking-wide">
                What the gateway owner will see
              </p>
              <AppIdentityCard
                app={{
                  name: appName || "My App",
                  description: appDescription || undefined,
                  homepage: homepage || undefined,
                }}
              />
              <div className="space-y-3">
                {(document.requests as Array<{ resource: string; actions: string[]; reason: string; constraints?: Record<string, unknown> }>).map((request, i) => (
                  <RequestReviewCard key={i} request={request} />
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Duration: {duration}
                {renewable ? ` · renewable every ${renewalPeriod}` : ""} ·
                budgets: {dailyRequests || "∞"} req/day, {dailyTokens || "∞"} tokens/day
              </p>
            </div>
          )}

          {tab === "snippets" && (
            <div className="space-y-3">
              <div className="relative">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bearer usage (after approval — zero dependencies)
                </p>
                <pre className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs overflow-x-auto text-slate-700 dark:text-slate-200">
                  {bearerSnippet}
                </pre>
                <button className="absolute top-6 right-2 text-xs text-primary-600" onClick={() => copy("bearer", bearerSnippet)}>
                  {copied === "bearer" ? "Copied!" : "Copy"}
                </button>
              </div>
              {auth === "pop" && (
                <div className="relative">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    PoP submission (@glueco/sdk)
                  </p>
                  <pre className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs overflow-x-auto text-slate-700 dark:text-slate-200">
                    {popSnippet}
                  </pre>
                  <button className="absolute top-6 right-2 text-xs text-primary-600" onClick={() => copy("pop", popSnippet)}>
                    {copied === "pop" ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
