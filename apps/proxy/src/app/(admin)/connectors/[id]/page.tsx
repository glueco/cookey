"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ConnectorReview,
  type ConnectorDocShape,
  type TrustLevel,
} from "@/components/connectors/ConnectorReview";

// ============================================
// CONNECTOR DETAIL
// Frozen doc viewer, credential form (driven by the document's
// `credentials` field → vault), enable toggle, update check + diff,
// remove (blocked while grants are bound).
// ============================================

interface ConnectorDetail {
  id: string;
  connectorId: string;
  version: string;
  source: "BUILTIN" | "REGISTRY" | "URL" | "CUSTOM";
  sourceUrl: string | null;
  enabled: boolean;
  document: ConnectorDocShape;
}

interface UpdateCheck {
  updateAvailable: boolean;
  currentVersion: string;
  candidateVersion: string;
  candidate: ConnectorDocShape;
  hostsAdded: string[];
  hostsRemoved: string[];
}

const TRUST: Record<ConnectorDetail["source"], TrustLevel> = {
  BUILTIN: "builtin",
  REGISTRY: "registry",
  URL: "url",
  CUSTOM: "custom",
};

export default function ConnectorDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const connectorId = decodeURIComponent(params.id);

  const [detail, setDetail] = useState<ConnectorDetail | null>(null);
  const [credConfigured, setCredConfigured] = useState(false);
  const [boundGrants, setBoundGrants] = useState<Array<{ grantId: string; appName: string }>>([]);
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/connectors/${encodeURIComponent(connectorId)}`,
      );
      if (!res.ok) {
        setError(
          res.status === 404
            ? "Connector not found"
            : `Failed to load connector (HTTP ${res.status})`,
        );
        return;
      }
      const data = await res.json();
      setDetail(data.connector);
      setCredConfigured(data.credentials.configured);
      setBoundGrants(data.boundGrants ?? []);
      // Seed non-secret fields from the stored config so re-saving a
      // key doesn't wipe fields like `organization`
      const storedConfig = data.credentials.config as
        | Record<string, unknown>
        | null
        | undefined;
      if (storedConfig) {
        setCredValues((prev) => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(storedConfig)) {
            if (!next[key] && typeof value === "string") next[key] = value;
          }
          return next;
        });
      }
      setError(null);
    } catch {
      setError("Failed to load connector");
    }
  }, [connectorId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <main className="min-h-screen max-w-2xl mx-auto p-6">
        <p className="text-red-600">{error}</p>
        <Link href="/connectors" className="text-sm underline">
          ← Back
        </Link>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="min-h-screen max-w-2xl mx-auto p-6 text-slate-500">
        Loading…
      </main>
    );
  }

  const doc = detail.document;
  const credentialFields = doc.credentials ?? [
    { name: "apiKey", type: "secret", label: "API key", required: true },
  ];

  const saveCredentials = async () => {
    setBusy("credentials");
    setMessage(null);
    try {
      const secretField = credentialFields.find((f) => f.type === "secret");
      const secret = credValues[secretField?.name ?? "apiKey"]?.trim();
      // Blank secret is allowed once credentials exist — the stored key
      // is kept; it is only required on first configuration
      if (!secret && !credConfigured) {
        throw new Error("The API key field is required");
      }

      const config: Record<string, string> = {};
      for (const field of credentialFields) {
        if (field.type === "secret") continue;
        const value = credValues[field.name];
        if (value) config[field.name] = value;
      }

      const res = await fetch("/api/admin/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId: detail.connectorId,
          name: doc.name,
          resourceType: doc.resourceType,
          ...(secret && { secret }),
          config,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      setMessage("Credentials saved.");
      setCredValues({});
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const checkUpdate = async () => {
    setBusy("update");
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/connectors/${encodeURIComponent(connectorId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check_update" }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check failed");
      if (!data.updateAvailable) {
        setMessage(`Up to date (v${data.currentVersion}).`);
      } else {
        setUpdate(data);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Check failed");
    } finally {
      setBusy(null);
    }
  };

  const applyUpdate = async () => {
    if (!update) return;
    setBusy("apply");
    try {
      const res = await fetch(
        `/api/admin/connectors/${encodeURIComponent(connectorId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "apply_update",
            document: update.candidate,
          }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Update failed");
      setUpdate(null);
      setMessage("Updated and re-frozen.");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (
      !confirm(
        `Remove ${doc.name}? Its stored credentials will be deleted too.`,
      )
    ) {
      return;
    }
    setBusy("remove");
    try {
      const res = await fetch(
        `/api/admin/connectors/${encodeURIComponent(connectorId)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Remove failed");
      router.push("/connectors");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Remove failed");
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {doc.name}
        </h1>
        <Link href="/connectors" className="text-sm text-slate-400 underline">
          ← All connectors
        </Link>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
          {message}
        </div>
      )}

      {/* Update diff modal-ish */}
      {update && (
        <div className="card p-4 border-2 border-blue-300 dark:border-blue-800 space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Update available: v{update.currentVersion} → v
            {update.candidateVersion}
          </p>
          {update.hostsAdded.length > 0 && (
            <p className="text-sm text-red-700 dark:text-red-300 font-semibold">
              ⚠ New egress hosts: {update.hostsAdded.join(", ")} — your
              credential will be sent to these hosts after updating.
            </p>
          )}
          {update.hostsRemoved.length > 0 && (
            <p className="text-sm text-slate-500">
              Hosts removed: {update.hostsRemoved.join(", ")}
            </p>
          )}
          <ConnectorReview
            document={update.candidate}
            trust={TRUST[detail.source]}
            highlightHosts={update.hostsAdded}
          />
          <div className="flex gap-2">
            <button
              className="btn-primary text-sm"
              disabled={busy === "apply"}
              onClick={applyUpdate}
            >
              {busy === "apply" ? "Applying…" : "Approve update & re-freeze"}
            </button>
            <button
              className="btn-secondary text-sm"
              onClick={() => setUpdate(null)}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* Credentials */}
      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Credentials
          </h2>
          <span
            className={`text-xs ${credConfigured ? "text-emerald-600" : "text-amber-600"}`}
          >
            {credConfigured ? "configured" : "not configured"}
          </span>
        </div>
        {credentialFields.map((field) => (
          <label key={field.name} className="block text-sm">
            {field.label}
            {field.required === false && (
              <span className="text-xs text-slate-400"> (optional)</span>
            )}
            <input
              type={field.type === "secret" ? "password" : "text"}
              className="input w-full mt-1 text-sm"
              placeholder={
                credConfigured && field.type === "secret"
                  ? "•••••••• (enter to replace)"
                  : undefined
              }
              value={credValues[field.name] ?? ""}
              onChange={(e) =>
                setCredValues((prev) => ({
                  ...prev,
                  [field.name]: e.target.value,
                }))
              }
            />
          </label>
        ))}
        <button
          className="btn-primary text-sm"
          disabled={busy === "credentials"}
          onClick={saveCredentials}
        >
          {busy === "credentials" ? "Saving…" : "Save credentials"}
        </button>
      </section>

      {/* Frozen document */}
      <section className="card p-4">
        <ConnectorReview document={doc} trust={TRUST[detail.source]} />
      </section>

      {/* Actions */}
      <section className="flex flex-wrap gap-2">
        {detail.source === "CUSTOM" && (
          <Link
            href={`/connectors/new?edit=${encodeURIComponent(detail.connectorId)}`}
            className="btn-secondary text-sm"
          >
            Edit in builder
          </Link>
        )}
        {detail.sourceUrl && (
          <button
            className="btn-secondary text-sm"
            disabled={busy === "update"}
            onClick={checkUpdate}
          >
            {busy === "update" ? "Checking…" : "Check for updates"}
          </button>
        )}
        <button
          className="btn-secondary text-sm text-red-600"
          disabled={busy === "remove" || boundGrants.length > 0}
          onClick={remove}
        >
          Remove connector
        </button>
      </section>
      {boundGrants.length > 0 && (
        <p className="text-xs text-slate-500">
          Removal blocked — active grants bound:{" "}
          {boundGrants.map((g) => g.appName).join(", ")}
        </p>
      )}
    </main>
  );
}
