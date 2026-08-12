"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import {
  CopyButton,
  Field,
  PageHeader,
  RelativeTime,
  useToast,
} from "@/components/ui";

// ============================================
// CONNECT AN APP
// Grants only ever arrive FROM the app — it proposes its own access
// levels and the owner picks one at approval. Two intake paths:
//   pairing code   → the app submits itself
//   well-known URL → we fetch the document the app publishes
// There is deliberately no hand-authored path: a grant the owner wrote
// isn't a request the app agreed to, and nothing would hold it to it.
// ============================================

type Tab = "pairing" | "url";

const TABS: Array<{ id: Tab; label: string; blurb: string }> = [
  {
    id: "pairing",
    label: "Pairing code",
    blurb: "The app has a place to paste a code.",
  },
  {
    id: "url",
    label: "From the app's URL",
    blurb: "The app publishes a grant document.",
  },
];

export default function ConnectAppPage() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("pairing");
  const [appUrl, setAppUrl] = useState("");
  const [pairing, setPairing] = useState<{
    pairingString: string;
    expiresAt: string;
  } | null>(null);
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
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't fetch a grant document from that URL",
      );
      setBusy(false);
    }
  };

  const generatePairing = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{
        pairingString: string;
        expiresAt: string;
      }>("/api/admin/pairing/generate", {});
      setPairing(result);
      toast.success("Pairing code ready", "Single use, expires in 10 minutes.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="p-8 space-y-6 max-w-2xl">
      <PageHeader
        title="Connect an app"
        description="Apps request access themselves and propose the access levels they can work with. You review the request and pick one — grants are never written here by hand."
        breadcrumb={
          <Link
            href="/grants"
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            ← All grants
          </Link>
        }
      />

      <div className="grid sm:grid-cols-2 gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => {
              setTab(entry.id);
              setError(null);
            }}
            aria-pressed={tab === entry.id}
            className={`${
              tab === entry.id ? "card-select-active" : "card-select"
            } !p-3.5`}
          >
            <span className="block text-[13px] font-semibold text-slate-900 dark:text-white">
              {entry.label}
            </span>
            <span className="block field-hint mt-0.5">{entry.blurb}</span>
          </button>
        ))}
      </div>

      {error && <p className="callout-danger">{error}</p>}

      {tab === "url" && (
        <section className="card p-5 space-y-4">
          <Field
            label="App URL"
            hint={
              <>
                We fetch{" "}
                <code className="code-inline">
                  /.well-known/cookey-grant.json
                </code>{" "}
                from this origin and show you exactly what it asks for before
                anything is granted.
              </>
            }
          >
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="https://app.example.com"
                value={appUrl}
                onChange={(event) => setAppUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && appUrl.trim()) fetchWellKnown();
                }}
              />
              <button
                className="btn-primary shrink-0"
                disabled={busy || !appUrl.trim()}
                onClick={fetchWellKnown}
              >
                {busy ? "Fetching…" : "Fetch request"}
              </button>
            </div>
          </Field>
        </section>
      )}

      {tab === "pairing" && (
        <section className="card p-5 space-y-4">
          <ol className="space-y-3">
            <Step n={1} title="Generate a code">
              Single use, valid for ten minutes.
            </Step>
            <Step n={2} title="Paste it into the app">
              The app submits its own access request using the code.
            </Step>
            <Step n={3} title="Review it here">
              The request appears under Grants as pending, waiting on you.
            </Step>
          </ol>

          {!pairing ? (
            <button
              className="btn-primary"
              disabled={busy}
              onClick={generatePairing}
            >
              {busy ? "Generating…" : "Generate pairing code"}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="code-block flex items-center gap-3">
                <code className="flex-1 text-emerald-300 break-all select-all">
                  {pairing.pairingString}
                </code>
                <CopyButton value={pairing.pairingString} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="field-hint">
                  Expires <RelativeTime value={pairing.expiresAt} />
                </span>
                <button
                  className="btn-ghost btn-sm"
                  disabled={busy}
                  onClick={generatePairing}
                >
                  Generate another
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="w-5 h-5 shrink-0 mt-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-semibold flex items-center justify-center">
        {n}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-200">
          {title}
        </span>
        <span className="block field-hint">{children}</span>
      </span>
    </li>
  );
}
