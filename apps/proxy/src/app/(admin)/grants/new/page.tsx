"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";

// ============================================
// ADD APP — three intake paths (5.2):
// well-known URL fetch | paste grant JSON | pairing-code instructions
// ============================================

export default function AddAppPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"url" | "paste" | "pairing">("url");
  const [appUrl, setAppUrl] = useState("");
  const [pasted, setPasted] = useState("");
  const [pairing, setPairing] = useState<{ pairingString: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWellKnown = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ grant: { id: string } }>(
        "/api/admin/grants/fetch",
        { appUrl: appUrl.trim() },
      );
      router.push(`/connect/approve?grant=${result.grant.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Fetch failed");
      setBusy(false);
    }
  };

  const submitPaste = async () => {
    setBusy(true);
    setError(null);
    try {
      let document: unknown;
      try {
        document = JSON.parse(pasted);
      } catch {
        throw new Error("Not valid JSON");
      }
      const result = await api.post<{ grant: { id: string } }>(
        "/api/admin/grants",
        { document },
      );
      router.push(`/connect/approve?grant=${result.grant.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
      setBusy(false);
    }
  };

  const generatePairing = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ pairingString: string; expiresAt: string }>(
        "/api/admin/pairing/generate",
        {},
      );
      setPairing(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Add app</h1>
        <Link href="/grants" className="text-sm text-slate-400 underline">
          ← Grants
        </Link>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["url", "From app URL"],
            ["paste", "Paste grant JSON"],
            ["pairing", "Pairing code"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${
              tab === key
                ? "bg-primary-600 text-white"
                : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {tab === "url" && (
        <section className="card p-4 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Paste the app's URL — its{" "}
            <code className="text-xs">/.well-known/cookey-grant.json</code> is
            fetched and shown on the approval screen.
          </p>
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="https://app.example.com"
              value={appUrl}
              onChange={(e) => setAppUrl(e.target.value)}
            />
            <button
              className="btn-primary text-sm"
              disabled={busy || !appUrl.trim()}
              onClick={fetchWellKnown}
            >
              {busy ? "Fetching…" : "Fetch & review"}
            </button>
          </div>
        </section>
      )}

      {tab === "paste" && (
        <section className="card p-4 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Paste a grant document the app author gave you (or built at{" "}
            <Link href="/builder" className="underline">/builder</Link>).
          </p>
          <textarea
            rows={12}
            className="input w-full text-xs font-mono"
            placeholder='{"specVersion": "1", "app": { "name": "…" }, …}'
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <button
            className="btn-primary text-sm"
            disabled={busy || !pasted.trim()}
            onClick={submitPaste}
          >
            {busy ? "Submitting…" : "Review this grant"}
          </button>
        </section>
      )}

      {tab === "pairing" && (
        <section className="card p-4 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Generate a single-use pairing code (10-minute TTL) and paste it
            into the app. The app submits its grant request itself; it then
            appears under Grants for review.
          </p>
          <button className="btn-primary text-sm" disabled={busy} onClick={generatePairing}>
            {busy ? "Generating…" : "Generate pairing string"}
          </button>
          {pairing && (
            <div className="p-3 rounded-lg bg-slate-900 dark:bg-slate-800 space-y-2">
              <code className="block text-xs text-emerald-300 font-mono break-all select-all">
                {pairing.pairingString}
              </code>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Expires {new Date(pairing.expiresAt).toLocaleTimeString()}
                </span>
                <button
                  className="btn-secondary text-xs"
                  onClick={() => navigator.clipboard.writeText(pairing.pairingString)}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
