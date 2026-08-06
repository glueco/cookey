"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

// ============================================
// SETTINGS — gateway name, marketplace URL, notification/digest config,
// defaults, danger zone.
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
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsResponse>("/api/admin/settings"),
  });
  const { data: connectorData } = useQuery({
    queryKey: ["connectors"],
    queryFn: () => api.get<{ connectors: ConnectorOption[] }>("/api/admin/connectors"),
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
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setForm({
      gatewayName: (s.gatewayName as string) ?? "",
      marketplaceUrl: (s.marketplaceUrl as string) ?? "",
      inactivitySuspendDaysDefault: String(s.inactivitySuspendDaysDefault ?? 14),
      digestEnabled: (s.digestEnabled as boolean) ?? false,
      digestMailConnector: (s.digestMailConnector as string) ?? "",
      digestMailTo: (s.digestMailTo as string) ?? "",
      digestMailFrom: (s.digestMailFrom as string) ?? "",
      autoSuspendOnAnomaly: (s.autoSuspendOnAnomaly as boolean) ?? false,
    });
  }, [data]);

  const save = async () => {
    setMessage(null);
    const entries: Array<[string, unknown]> = [
      ["gatewayName", form.gatewayName],
      ["marketplaceUrl", form.marketplaceUrl || data?.defaults.marketplaceUrl],
      ["inactivitySuspendDaysDefault", parseInt(form.inactivitySuspendDaysDefault || "14", 10)],
      ["digestEnabled", form.digestEnabled],
      ["digestMailConnector", form.digestMailConnector],
      ["digestMailTo", form.digestMailTo],
      ["digestMailFrom", form.digestMailFrom],
      ["autoSuspendOnAnomaly", form.autoSuspendOnAnomaly],
    ];
    for (const [key, value] of entries) {
      await api.patch("/api/admin/settings", { key, value });
    }
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    setMessage("Saved.");
  };

  const restoreBuiltins = async () => {
    if (!confirm("Restore the shipped built-in connector documents? Admin modifications to them are overwritten.")) return;
    await api.post("/api/admin/connectors", { restoreBuiltins: true });
    setMessage("Built-in connectors restored.");
  };

  const runSweep = async () => {
    const result = await api.post<{ results: Record<string, number> }>("/api/admin/sweep", {});
    setMessage(`Sweep done: ${JSON.stringify(result.results)}`);
  };

  const mailConnectors =
    connectorData?.connectors.filter(
      (c) => c.resourceType === "mail" && c.credentialsConfigured,
    ) ?? [];

  return (
    <main className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>

      {message && (
        <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
          {message}
        </div>
      )}

      <section className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Gateway</h2>
        <label className="block text-sm">
          Gateway name
          <input
            className="input w-full mt-1 text-sm"
            placeholder="Cookey Gateway"
            value={form.gatewayName}
            onChange={(e) => setForm((f) => ({ ...f, gatewayName: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          Marketplace registry URL
          <input
            className="input w-full mt-1 text-sm font-mono"
            placeholder={data?.defaults.marketplaceUrl}
            value={form.marketplaceUrl}
            onChange={(e) => setForm((f) => ({ ...f, marketplaceUrl: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          Default inactivity suspend (days, 0 = off)
          <input
            type="number"
            min={0}
            className="input w-24 mt-1 text-sm"
            value={form.inactivitySuspendDaysDefault}
            onChange={(e) =>
              setForm((f) => ({ ...f, inactivitySuspendDaysDefault: e.target.value }))
            }
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={form.autoSuspendOnAnomaly}
            onChange={(e) => setForm((f) => ({ ...f, autoSuspendOnAnomaly: e.target.checked }))}
          />
          Auto-suspend grants on anomalous traffic (default off)
        </label>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Weekly digest
        </h2>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={form.digestEnabled}
            onChange={(e) => setForm((f) => ({ ...f, digestEnabled: e.target.checked }))}
          />
          Send a weekly usage digest (always appears in notifications; email
          when a mail connector is configured below)
        </label>
        <label className="block text-sm">
          Mail connector
          <select
            className="input w-full mt-1 text-sm"
            value={form.digestMailConnector}
            onChange={(e) => setForm((f) => ({ ...f, digestMailConnector: e.target.value }))}
          >
            <option value="">— in-app notification only —</option>
            {mailConnectors.map((c) => (
              <option key={c.connectorId} value={c.connectorId}>
                {c.document.name} ({c.connectorId})
              </option>
            ))}
          </select>
        </label>
        {form.digestMailConnector && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              From address
              <input
                className="input w-full mt-1 text-sm"
                placeholder="gateway@yourdomain.com"
                value={form.digestMailFrom}
                onChange={(e) => setForm((f) => ({ ...f, digestMailFrom: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              To address
              <input
                className="input w-full mt-1 text-sm"
                placeholder="you@yourdomain.com"
                value={form.digestMailTo}
                onChange={(e) => setForm((f) => ({ ...f, digestMailTo: e.target.value }))}
              />
            </label>
          </div>
        )}
      </section>

      <button className="btn-primary" onClick={save}>
        Save settings
      </button>

      <section className="card p-4 space-y-3 border-red-200 dark:border-red-900">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">
          Danger zone
        </h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary text-sm" onClick={runSweep}>
            Run housekeeping sweep now
          </button>
          <button className="btn-secondary text-sm" onClick={restoreBuiltins}>
            Restore built-in connectors
          </button>
        </div>
      </section>
    </main>
  );
}
