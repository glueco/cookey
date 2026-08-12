"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  ErrorState,
  Field,
  LoadingRows,
  NumberField,
  PageHeader,
  Section,
  Switch,
  useConfirm,
  useToast,
} from "@/components/ui";

// ============================================
// SETTINGS — gateway identity, marketplace source, digest, defaults,
// and the maintenance actions that don't belong anywhere else.
// ============================================

interface SettingsResponse {
  settings: Record<string, unknown>;
  defaults: { marketplaceUrl: string };
}

interface ConnectorOption {
  connectorId: string;
  resourceType: string;
  document: { name: string };
  credentialsConfigured: boolean;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();

  const { data, error: loadError, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsResponse>("/api/admin/settings"),
  });
  const { data: connectorData } = useQuery({
    queryKey: ["connectors"],
    queryFn: () =>
      api.get<{ connectors: ConnectorOption[] }>("/api/admin/connectors"),
  });

  const [form, setForm] = useState({
    gatewayName: "",
    marketplaceUrl: "",
    inactivitySuspendDaysDefault: "14",
    digestEnabled: false,
    digestMailConnector: "",
    digestMailTo: "",
    digestMailFrom: "",
    autoSuspendOnAnomaly: false,
  });
  const [saving, setSaving] = useState(false);
  // What the server currently has, serialized — "Save" only lights up
  // when the form has actually diverged from it.
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    const loaded = {
      gatewayName: (s.gatewayName as string) ?? "",
      marketplaceUrl: (s.marketplaceUrl as string) ?? "",
      inactivitySuspendDaysDefault: String(
        s.inactivitySuspendDaysDefault ?? 14,
      ),
      digestEnabled: (s.digestEnabled as boolean) ?? false,
      digestMailConnector: (s.digestMailConnector as string) ?? "",
      digestMailTo: (s.digestMailTo as string) ?? "",
      digestMailFrom: (s.digestMailFrom as string) ?? "",
      autoSuspendOnAnomaly: (s.autoSuspendOnAnomaly as boolean) ?? false,
    };
    setForm(loaded);
    setSavedSnapshot(JSON.stringify(loaded));
  }, [data]);

  const dirty =
    savedSnapshot !== null && JSON.stringify(form) !== savedSnapshot;

  const save = async () => {
    // The form only renders once `data` has loaded (see below), so a save
    // can never clobber stored values with blank initial state.
    setSaving(true);
    try {
      await api.patch("/api/admin/settings", {
        settings: {
          gatewayName: form.gatewayName,
          marketplaceUrl:
            form.marketplaceUrl || data?.defaults.marketplaceUrl || "",
          inactivitySuspendDaysDefault: parseInt(
            form.inactivitySuspendDaysDefault || "14",
            10,
          ),
          digestEnabled: form.digestEnabled,
          digestMailConnector: form.digestMailConnector,
          digestMailTo: form.digestMailTo,
          digestMailFrom: form.digestMailFrom,
          autoSuspendOnAnomaly: form.autoSuspendOnAnomaly,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setSavedSnapshot(JSON.stringify(form));
      toast.success("Settings saved");
    } catch (err) {
      toast.error(
        "Save failed",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  const restoreBuiltins = async () => {
    const ok = await confirm({
      title: "Restore built-in connectors?",
      body: "The shipped documents overwrite the built-ins currently installed. Any edits you made to them are lost.",
      confirmLabel: "Restore",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.post("/api/admin/connectors", { restoreBuiltins: true });
      queryClient.invalidateQueries({ queryKey: ["connectors"] });
      toast.success("Built-in connectors restored");
    } catch (err) {
      toast.error(
        "Restore failed",
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const runSweep = async () => {
    try {
      const result = await api.post<{ results: Record<string, number> }>(
        "/api/admin/sweep",
        {},
      );
      const summary = Object.entries(result.results)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${count} ${key}`)
        .join(", ");
      toast.success("Housekeeping sweep finished", summary || "Nothing to do.");
    } catch (err) {
      toast.error(
        "Sweep failed",
        err instanceof Error ? err.message : undefined,
      );
    }
  };

  const mailConnectors =
    connectorData?.connectors.filter(
      (c) => c.resourceType === "mail" && c.credentialsConfigured,
    ) ?? [];

  if (loadError) {
    return (
      <main className="p-8 space-y-5 max-w-2xl">
        <PageHeader title="Settings" />
        <ErrorState
          message={`Couldn't load settings: ${
            loadError instanceof Error ? loadError.message : "unknown error"
          }`}
          onRetry={() => refetch()}
        />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="p-8 space-y-5 max-w-2xl">
        <PageHeader title="Settings" />
        <div className="card p-5">
          <LoadingRows rows={3} />
        </div>
      </main>
    );
  }

  return (
    <main className="p-8 space-y-5 max-w-2xl">
      <PageHeader
        title="Settings"
        description="How this gateway identifies itself, where it looks for connectors, and the defaults it applies to new grants."
      />

      <Section title="Gateway">
        <div className="space-y-4">
          <Field
            label="Gateway name"
            hint="Shown in the sidebar and on the sign-in screen."
          >
            <input
              className="input"
              placeholder="Cookey Gateway"
              value={form.gatewayName}
              onChange={(event) =>
                setForm((f) => ({ ...f, gatewayName: event.target.value }))
              }
            />
          </Field>

          <Field
            label="Marketplace registry URL"
            hint="Where connector listings are fetched from. Leave blank for the default registry."
          >
            <input
              className="input font-mono"
              placeholder={data.defaults.marketplaceUrl}
              value={form.marketplaceUrl}
              onChange={(event) =>
                setForm((f) => ({ ...f, marketplaceUrl: event.target.value }))
              }
            />
          </Field>

          <Field
            label="Default idle-suspend window"
            hint="Prefilled on the approval screen. A grant that goes unused this long is suspended automatically. 0 turns it off."
          >
            <div className="w-28">
              <NumberField
                value={form.inactivitySuspendDaysDefault}
                min={0}
                suffix="days"
                onChange={(value) =>
                  setForm((f) => ({
                    ...f,
                    inactivitySuspendDaysDefault: value,
                  }))
                }
              />
            </div>
          </Field>

          <Switch
            checked={form.autoSuspendOnAnomaly}
            onChange={(checked) =>
              setForm((f) => ({ ...f, autoSuspendOnAnomaly: checked }))
            }
            label="Auto-suspend grants on anomalous traffic"
            description="Off by default — it can interrupt a legitimate burst."
          />
        </div>
      </Section>

      <Section
        title="Weekly digest"
        description="A summary of spend, traffic and anything that needs attention."
      >
        <div className="space-y-4">
          <Switch
            checked={form.digestEnabled}
            onChange={(checked) =>
              setForm((f) => ({ ...f, digestEnabled: checked }))
            }
            label="Send a weekly usage digest"
            description="Always appears in notifications; also emailed when a mail connector is set below."
          />

          {form.digestEnabled && (
            <>
              <Field
                label="Mail connector"
                hint={
                  mailConnectors.length === 0
                    ? "No mail connector has credentials yet — the digest will stay in-app only."
                    : undefined
                }
              >
                <select
                  className="input"
                  value={form.digestMailConnector}
                  onChange={(event) =>
                    setForm((f) => ({
                      ...f,
                      digestMailConnector: event.target.value,
                    }))
                  }
                >
                  <option value="">— in-app notification only —</option>
                  {mailConnectors.map((connector) => (
                    <option
                      key={connector.connectorId}
                      value={connector.connectorId}
                    >
                      {connector.document.name} ({connector.connectorId})
                    </option>
                  ))}
                </select>
              </Field>

              {form.digestMailConnector && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="From address">
                    <input
                      className="input"
                      placeholder="gateway@yourdomain.com"
                      value={form.digestMailFrom}
                      onChange={(event) =>
                        setForm((f) => ({
                          ...f,
                          digestMailFrom: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="To address">
                    <input
                      className="input"
                      placeholder="you@yourdomain.com"
                      value={form.digestMailTo}
                      onChange={(event) =>
                        setForm((f) => ({
                          ...f,
                          digestMailTo: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>
              )}
            </>
          )}
        </div>
      </Section>

      <div className="flex items-center justify-end gap-3">
        {dirty && !saving && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Unsaved changes
          </span>
        )}
        <button
          className="btn-primary"
          disabled={saving || !dirty}
          onClick={save}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      <Section
        title="Maintenance"
        description="Occasionally useful, rarely urgent."
      >
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={runSweep}>
            Run housekeeping sweep
          </button>
          <button className="btn-secondary btn-sm" onClick={restoreBuiltins}>
            Restore built-in connectors
          </button>
        </div>
      </Section>

      {confirmDialog}
    </main>
  );
}
