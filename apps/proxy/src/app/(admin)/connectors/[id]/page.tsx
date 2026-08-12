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

interface PricingEntry {
  inputPerMTok: number;
  outputPerMTok: number;
}

interface ConnectorDetail {
  id: string;
  connectorId: string;
  version: string;
  source: "BUILTIN" | "REGISTRY" | "URL" | "CUSTOM";
  sourceUrl: string | null;
  enabled: boolean;
  document: ConnectorDocShape & {
    models?: string[];
    pricing?: Record<string, PricingEntry>;
  };
  pricingOverrides: Record<string, PricingEntry> | null;
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
        <p className="text-rose-600">{error}</p>
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
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
          {doc.name}
        </h1>
        <Link href="/connectors" className="text-sm text-slate-400 underline">
          ← All connectors
        </Link>
      </div>

      {message && (
        <div className="callout-info">
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
            <p className="text-sm text-rose-700 dark:text-rose-300 font-semibold">
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

      {/* Pricing — the one part of a frozen document the owner may
          correct, because it describes THEIR bill: free tiers,
          negotiated rates, models the document doesn't price. */}
      <PricingSection
        detail={detail}
        onSaved={(note) => {
          setMessage(note);
          load();
        }}
      />

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
          className="btn-secondary text-sm text-rose-600"
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

// ============================================
// PRICING EDITOR
// Effective rate = owner override ?? document pricing. Overrides live
// on the row, never in the frozen document, and drive everything
// priced: spend budgets, the approval screen's worst-case projection,
// per-request cost estimates. 0/0 marks a model explicitly free —
// different from blank, which means "no pricing data, no estimates".
// ============================================

function PricingSection({
  detail,
  onSaved,
}: {
  detail: ConnectorDetail;
  onSaved: (note: string) => void;
}) {
  const doc = detail.document;
  const documentPricing = doc.pricing ?? {};
  const overrides = detail.pricingOverrides ?? {};

  const models = [
    ...new Set([
      ...(doc.models ?? []),
      ...Object.keys(documentPricing),
      ...Object.keys(overrides),
    ]),
  ];

  const toDraft = (entry: PricingEntry | undefined) => ({
    input: entry ? String(entry.inputPerMTok) : "",
    output: entry ? String(entry.outputPerMTok) : "",
  });
  const initialDraft = () =>
    Object.fromEntries(
      models.map((model) => [
        model,
        toDraft(overrides[model] ?? documentPricing[model]),
      ]),
    );

  const [draft, setDraft] = useState<
    Record<string, { input: string; output: string }>
  >(initialDraft);
  const [saving, setSaving] = useState(false);

  // Reload after save/update re-anchors the drafts to the new effective
  // rates — detail identity changes only when `load()` refetches.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(initialDraft()), [detail]);

  if (models.length === 0) return null;

  const dirty = models.some((model) => {
    const initial = toDraft(overrides[model] ?? documentPricing[model]);
    return (
      draft[model]?.input !== initial.input ||
      draft[model]?.output !== initial.output
    );
  });

  const save = async () => {
    setSaving(true);
    try {
      // A draft equal to the document's own rates needs no override —
      // and clears any stale one, so document updates flow again.
      const patch: Record<string, PricingEntry | null> = {};
      for (const model of models) {
        const { input, output } = draft[model] ?? { input: "", output: "" };
        const docEntry = documentPricing[model];
        const blank = input.trim() === "" && output.trim() === "";
        const entry: PricingEntry | null = blank
          ? null
          : {
              inputPerMTok: Math.max(0, parseFloat(input) || 0),
              outputPerMTok: Math.max(0, parseFloat(output) || 0),
            };
        const matchesDocument =
          (entry === null && !docEntry) ||
          (entry !== null &&
            docEntry &&
            docEntry.inputPerMTok === entry.inputPerMTok &&
            docEntry.outputPerMTok === entry.outputPerMTok);
        patch[model] = matchesDocument ? null : entry;
      }
      const res = await fetch(
        `/api/admin/connectors/${encodeURIComponent(detail.connectorId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pricingOverrides: patch }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      onSaved("Pricing saved — estimates and spend budgets use these rates.");
    } catch (err) {
      onSaved(err instanceof Error ? err.message : "Saving pricing failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Pricing
        </h2>
        {Object.keys(overrides).length > 0 && (
          <span className="badge-info">
            {Object.keys(overrides).length} edited
          </span>
        )}
      </div>
      <p className="field-hint">
        $ per million tokens, as billed to <em>you</em>. Spend estimates and
        budgets follow these numbers. Set 0 / 0 for a model you use free;
        leave both blank when the rate is unknown (no estimate is better than
        a wrong one). The connector document itself stays frozen.
      </p>

      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Model</th>
              <th className="text-right">Input $/MTok</th>
              <th className="text-right">Output $/MTok</th>
              <th className="text-right">Source</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => {
              const row = draft[model] ?? { input: "", output: "" };
              const overridden = model in overrides;
              const blank = row.input === "" && row.output === "";
              const free =
                !blank &&
                (parseFloat(row.input) || 0) === 0 &&
                (parseFloat(row.output) || 0) === 0;
              return (
                <tr key={model}>
                  <td className="font-mono text-xs">{model}</td>
                  {(["input", "output"] as const).map((side) => (
                    <td key={side} className="text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="input !w-24 !px-2 !py-1 text-right text-xs tabular-nums inline-block"
                        placeholder="—"
                        aria-label={`${model} ${side} price per million tokens`}
                        value={row[side]}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            [model]: { ...row, [side]: event.target.value },
                          }))
                        }
                      />
                    </td>
                  ))}
                  <td className="text-right">
                    {blank ? (
                      <span className="badge-neutral">unpriced</span>
                    ) : free ? (
                      <span className="badge-success">free</span>
                    ) : overridden ? (
                      <button
                        className="badge-info"
                        title="Reset to the document's rates"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            [model]: toDraft(documentPricing[model]),
                          }))
                        }
                      >
                        edited · reset
                      </button>
                    ) : (
                      <span className="badge-neutral">document</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dirty && (
        <div className="flex items-center justify-end gap-3">
          <button
            className="btn-secondary btn-sm"
            onClick={() => setDraft(initialDraft())}
          >
            Discard
          </button>
          <button
            className="btn-primary btn-sm"
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving…" : "Save pricing"}
          </button>
        </div>
      )}
    </section>
  );
}
