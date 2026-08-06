"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ConnectorReview,
  type ConnectorDocShape,
} from "@/components/connectors/ConnectorReview";

// ============================================
// INSTALL CONNECTOR BY URL
// Two-step: preview (SSRF-guarded fetch + validation) → review screen
// (9.4) → confirm-install with the previewed document echoed back.
// ============================================

function InstallConnectorInner() {
  const searchParams = useSearchParams();
  const fromRegistry = searchParams.get("registry") === "1";
  const [url, setUrl] = useState(searchParams.get("url") ?? "");
  const [preview, setPreview] = useState<ConnectorDocShape | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Array<{ path: string; message: string }>>([]);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const presetUrl = searchParams.get("url");
    if (presetUrl) fetchPreviewFor(presetUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPreview = () => fetchPreviewFor(url.trim());

  const fetchPreviewFor = async (targetUrl: string) => {
    setBusy(true);
    setError(null);
    setDetails([]);
    try {
      const res = await fetch("/api/admin/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, preview: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDetails(data.details ?? []);
        throw new Error(data.error ?? "Preview failed");
      }
      setPreview(data.preview);
      setSourceUrl(data.sourceUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmInstall = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: sourceUrl,
          document: preview,
          ...(fromRegistry && { registry: true }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Install failed");
      setInstalled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Install failed");
    } finally {
      setBusy(false);
    }
  };

  if (installed && preview) {
    return (
      <main className="min-h-screen max-w-2xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {preview.name} installed
        </h1>
        <p className="text-sm text-slate-500">
          The document is frozen at v{preview.version}. Next: add its
          credentials so grants can bind to it.
        </p>
        <div className="flex gap-3">
          <Link
            href={`/connectors/${encodeURIComponent(preview.id)}`}
            className="btn-primary text-sm"
          >
            Add credentials
          </Link>
          <Link href="/connectors" className="btn-secondary text-sm">
            All connectors
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Install connector from URL
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          The document is fetched once, reviewed, then frozen. The gateway
          never re-fetches it at request time.
        </p>
      </div>

      {!preview && (
        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder="https://example.com/connector.json"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            className="btn-primary text-sm"
            disabled={busy || !url.trim()}
            onClick={fetchPreview}
          >
            {busy ? "Fetching…" : "Fetch & review"}
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          <p>{error}</p>
          {details.length > 0 && (
            <ul className="mt-1 text-xs list-disc pl-4">
              {details.map((d, i) => (
                <li key={i}>
                  {d.path ? `${d.path}: ` : ""}
                  {d.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {preview && (
        <>
          <ConnectorReview document={preview} trust={fromRegistry ? "registry" : "url"} />
          <div className="flex gap-3">
            <button
              className="btn-primary flex-1"
              disabled={busy}
              onClick={confirmInstall}
            >
              {busy ? "Installing…" : "Install and freeze this version"}
            </button>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      <Link href="/connectors" className="text-sm text-slate-400 underline">
        ← Back to connectors
      </Link>
    </main>
  );
}

export default function InstallConnectorPage() {
  return (
    <Suspense>
      <InstallConnectorInner />
    </Suspense>
  );
}
