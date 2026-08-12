"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ResourceCapabilities } from "@/server/connectors/capabilities";
import { ServiceLimits } from "@/components/grant/approval-parts";
import {
  BUDGET_FIELDS,
  DAY_MS,
  DURATION_PRESETS,
  normalizeTemplateValues,
  parseBudgetValue,
  summarizeTemplate,
  type BudgetKey,
  type TemplateRow,
  type TemplateService,
  type TemplateValues,
} from "@/lib/templates";
import {
  CheckCard,
  EmptyState,
  Field,
  LoadingRows,
  NumberField,
  PageHeader,
  Segmented,
  Switch,
  useConfirm,
  useToast,
} from "@/components/ui";

// ============================================
// PERMISSION TEMPLATES
//
// A template is a ready-to-use permissions PACKAGE — the services and
// operations it covers, the ceilings on each, and the duration, budget
// and hardening that go with them. Apply one on an approval screen and
// it narrows the app's request to the package in a single click.
//
// It is not a rival to what an app asks for, and it is never required:
// with no template applied, the app's own request stands. See
// src/lib/templates.ts for the intersection rule.
// ============================================

const BLANK: TemplateValues = {
  durationMs: 30 * DAY_MS,
  renewal: { periodDays: 30 },
  budget: { dailyRequests: 500 },
  inactivitySuspendDays: 14,
  allowBrowser: false,
};

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [editing, setEditing] = useState<
    { template: TemplateRow | null } | null
  >(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const result = await api.get<{ templates: TemplateRow[] }>(
        "/api/admin/templates",
      );
      return {
        templates: result.templates.map((template) => ({
          ...template,
          values: normalizeTemplateValues(template.values),
        })),
      };
    },
  });

  // The services a package can be built out of. Fetched alongside so the
  // cards can name a template's services instead of printing ids.
  const { data: catalogue } = useQuery({
    queryKey: ["capabilities"],
    queryFn: () =>
      api.get<{ capabilities: ResourceCapabilities[] }>(
        "/api/admin/capabilities",
      ),
  });
  const capabilities = catalogue?.capabilities ?? [];

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/templates?id=${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });

  const templates = data?.templates ?? [];

  const onDelete = async (template: TemplateRow) => {
    const ok = await confirm({
      title: `Delete “${template.name}”?`,
      body: "Grants already approved with it are unaffected — a template is only ever applied at approval time.",
      confirmLabel: "Delete template",
      tone: "danger",
    });
    if (!ok) return;
    await remove.mutateAsync(template.id);
    toast.success(`Deleted “${template.name}”`);
  };

  const onDuplicate = (template: TemplateRow) =>
    setEditing({
      template: { ...template, id: "", name: `${template.name} copy` },
    });

  return (
    <main className="p-8 space-y-6 max-w-4xl">
      <PageHeader
        title="Permission templates"
        description="Ready-to-use packages of access: which services, which operations, under what ceilings, for how long. Apply one on an approval screen to narrow an app's request to the package in a single click — every field stays editable after."
        actions={
          <button
            className="btn-primary"
            onClick={() => setEditing({ template: null })}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New template
          </button>
        }
      />

      <p className="callout-info">
        A template can only ever <strong>narrow</strong> a request. Applying
        one keeps the operations the app asked for <em>and</em> the package
        allows, drops the rest, and never adds anything the app didn't ask
        for. Applying one is optional — with no template, the app's own
        request is what you're approving.
      </p>

      {isLoading ? (
        <div className="card p-5">
          <LoadingRows rows={2} />
        </div>
      ) : error ? (
        <p className="callout-danger">
          Couldn't load templates: {error.message}
        </p>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          }
          title="No templates yet"
          description="Build a package here — pick the services and operations you're willing to hand out, set their ceilings — and it becomes a one-click preset next time an app asks for access."
          action={
            <button
              className="btn-primary"
              onClick={() => setEditing({ template: null })}
            >
              Create your first template
            </button>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 stagger">
          {templates.map((template, index) => (
            <TemplateCard
              key={template.id}
              template={template}
              index={index}
              capabilities={capabilities}
              onEdit={() => setEditing({ template })}
              onDuplicate={() => onDuplicate(template)}
              onDelete={() => onDelete(template)}
            />
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditor
          template={editing.template}
          capabilities={capabilities}
          existingNames={templates.map((t) => t.name)}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            queryClient.invalidateQueries({ queryKey: ["templates"] });
            setEditing(null);
            toast.success(`Saved “${name}”`);
          }}
        />
      )}
      {confirmDialog}
    </main>
  );
}

// ============================================
// CARD
// ============================================

function TemplateCard({
  template,
  index,
  capabilities,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: TemplateRow;
  index: number;
  capabilities: ResourceCapabilities[];
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const services = template.values.services ?? [];
  const nameFor = (resourceId: string) =>
    capabilities.find((c) => c.resourceId === resourceId)?.name ?? resourceId;

  return (
    <article
      className="card p-4 flex flex-col gap-3"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
          {template.name}
        </h2>
        {template.description && (
          <p className="field-hint mt-0.5 truncate-2">{template.description}</p>
        )}
      </div>

      {/* The package itself, spelled out — the point of a template is
          that you can see what it hands over without opening it. */}
      {services.length > 0 ? (
        <ul className="space-y-1">
          {services.map((service) => (
            <li
              key={service.resourceId}
              className="flex items-baseline justify-between gap-2 text-[13px]"
            >
              <span className="text-slate-800 dark:text-slate-200 truncate">
                {nameFor(service.resourceId)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                {service.actions.length} op
                {service.actions.length === 1 ? "" : "s"}
                {Object.keys(service.constraints ?? {}).length > 0 && " · capped"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">
          No services attached — this one only carries duration, budget and
          hardening.
        </p>
      )}

      <ul className="flex flex-wrap gap-1.5">
        {summarizeTemplate(template.values).map((chip) => (
          <li key={chip} className="badge-neutral">
            {chip}
          </li>
        ))}
      </ul>

      <div className="flex gap-1.5 mt-auto pt-1">
        <button className="btn-secondary btn-sm" onClick={onEdit}>
          Edit
        </button>
        <button className="btn-ghost btn-sm" onClick={onDuplicate}>
          Duplicate
        </button>
        <button
          className="btn-ghost btn-sm ml-auto text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

// ============================================
// EDITOR
// ============================================

function TemplateEditor({
  template,
  capabilities,
  existingNames,
  onClose,
  onSaved,
}: {
  /** null = new; an entry with id:"" = duplicate of an existing one */
  template: TemplateRow | null;
  capabilities: ResourceCapabilities[];
  existingNames: string[];
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const initial = template?.values ?? BLANK;

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");

  // The package: resourceId → chosen actions + limits. Absent key means
  // the service isn't in the package at all, which is different from a
  // service included with no operations.
  const [services, setServices] = useState<Record<string, TemplateService>>(
    () =>
      Object.fromEntries(
        (initial.services ?? []).map((service) => [
          service.resourceId,
          service,
        ]),
      ),
  );

  const [durationMs, setDurationMs] = useState<number | null>(
    initial.durationMs === undefined ? 30 * DAY_MS : initial.durationMs,
  );
  const [renewable, setRenewable] = useState(Boolean(initial.renewal));
  const [renewalDays, setRenewalDays] = useState(
    initial.renewal?.periodDays ?? 30,
  );
  const [budget, setBudget] = useState<Record<BudgetKey, string>>(() => {
    const source = initial.budget ?? {};
    return Object.fromEntries(
      BUDGET_FIELDS.map(([key]) => [key, source[key]?.toString() ?? ""]),
    ) as Record<BudgetKey, string>;
  });
  const [inactivityDays, setInactivityDays] = useState(
    String(initial.inactivitySuspendDays ?? 14),
  );
  const [allowBrowser, setAllowBrowser] = useState(
    initial.allowBrowser ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const values: TemplateValues = useMemo(
    () => ({
      services: Object.values(services).filter(
        (service) => service.actions.length > 0,
      ),
      durationMs,
      renewal: renewable ? { periodDays: renewalDays } : null,
      budget: Object.fromEntries(
        BUDGET_FIELDS.map(([key]) => [key, budget[key].trim()] as const)
          .filter(([, value]) => value !== "")
          .map(([key, value]) => [key, parseBudgetValue(key, value)])
          .filter(([, value]) => Number.isFinite(value) && (value as number) > 0),
      ),
      inactivitySuspendDays: parseInt(inactivityDays || "0", 10),
      allowBrowser,
    }),
    [
      services,
      durationMs,
      renewable,
      renewalDays,
      budget,
      inactivityDays,
      allowBrowser,
    ],
  );

  const trimmedName = name.trim();
  const renaming = Boolean(template?.id) && trimmedName !== template?.name;
  const nameTaken =
    trimmedName !== template?.name && existingNames.includes(trimmedName);

  const toggleService = (capability: ResourceCapabilities, on: boolean) =>
    setServices((prev) => {
      const next = { ...prev };
      if (!on) {
        delete next[capability.resourceId];
        return next;
      }
      // Including a service starts from ALL of its operations — an owner
      // adds a service because they want it usable, then subtracts.
      next[capability.resourceId] = {
        resourceId: capability.resourceId,
        actions: capability.actions.map((action) => action.id),
      };
      return next;
    });

  const setServiceActions = (resourceId: string, actions: string[]) =>
    setServices((prev) => ({
      ...prev,
      [resourceId]: { ...prev[resourceId], resourceId, actions },
    }));

  const setServiceConstraints = (
    resourceId: string,
    constraints: Record<string, unknown>,
  ) =>
    setServices((prev) => ({
      ...prev,
      [resourceId]: { ...prev[resourceId], resourceId, constraints },
    }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/admin/templates", {
        name: trimmedName,
        description: description.trim() || undefined,
        values,
      });
      // The API upserts by NAME, so a rename would otherwise leave the
      // old template behind as a duplicate. Clean it up explicitly.
      if (renaming && template?.id) {
        await api.delete(`/api/admin/templates?id=${template.id}`);
      }
      onSaved(trimmedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-editor-title"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />
      {/* The panel owns its scrolling, rather than the page scrolling
          past a sticky header — a package with every connector in it is
          taller than the viewport, and a header that overlaps the first
          service is worse than no header. */}
      <div className="relative w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl animate-scale-in">
        <div className="section-header shrink-0 rounded-t-xl">
          <h2 id="template-editor-title" className="section-title">
            {template?.id ? `Edit “${template.name}”` : "New template"}
          </h2>
          <button className="btn-icon" aria-label="Close" onClick={onClose}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto flex-1 min-h-0">
          <Field
            label="Name"
            error={nameTaken ? "A template with this name already exists" : null}
          >
            <input
              autoFocus
              className={`input ${nameTaken ? "input-error" : ""}`}
              placeholder="Chat-only, cheap models"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field
            label="Description"
            hint="Shown next to the name when you pick it on an approval screen."
          >
            <input
              className="input"
              placeholder="Groq chat completions on the small models, 30 days, tight budget."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          {/* ---- the package ------------------------------------------ */}
          <section className="space-y-2">
            <div>
              <h3 className="field-label">What this package hands over</h3>
              <p className="field-hint mt-0.5">
                Pick the services and operations you're willing to grant, and
                the ceilings each runs under. An app only ever receives the
                overlap between this and what it actually asked for.
              </p>
            </div>

            {capabilities.length === 0 ? (
              <p className="callout-warning">
                No connectors are enabled on this gateway yet, so there's
                nothing to put in a package.{" "}
                <Link href="/connectors" className="underline underline-offset-2">
                  Add one under Connectors
                </Link>{" "}
                — you can still save duration and budget defaults here.
              </p>
            ) : (
              <div className="space-y-2">
                {capabilities.map((capability) => (
                  <ServicePicker
                    key={capability.resourceId}
                    capability={capability}
                    service={services[capability.resourceId]}
                    onToggle={(on) => toggleService(capability, on)}
                    onActionsChange={(actions) =>
                      setServiceActions(capability.resourceId, actions)
                    }
                    onConstraintsChange={(constraints) =>
                      setServiceConstraints(capability.resourceId, constraints)
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* ---- duration --------------------------------------------- */}
          <Field label="Duration">
            <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
              <Segmented
                value={durationMs}
                onChange={setDurationMs}
                options={DURATION_PRESETS.map((preset) => ({
                  value: preset.ms,
                  label: preset.label,
                }))}
              />
            </div>
          </Field>

          <div className="well p-3.5 space-y-3">
            <Switch
              checked={renewable}
              onChange={setRenewable}
              label="Renewable"
              description="Access lapses at the end of each period unless renewed."
            />
            {renewable && (
              <div className="flex items-center gap-2 pl-12">
                <span className="text-[13px] text-slate-600 dark:text-slate-300">
                  Every
                </span>
                <div className="w-24">
                  <NumberField
                    value={String(renewalDays)}
                    onChange={(value) => {
                      const parsed = parseInt(value || "30", 10);
                      setRenewalDays(
                        Number.isNaN(parsed) ? 30 : Math.max(1, parsed),
                      );
                    }}
                  />
                </div>
                <span className="text-[13px] text-slate-600 dark:text-slate-300">
                  days
                </span>
              </div>
            )}
          </div>

          <Field label="Budget caps" hint="Empty means no cap on that dimension.">
            <div className="grid grid-cols-2 gap-3">
              {BUDGET_FIELDS.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="field-hint">{label}</span>
                  <div className="mt-1">
                    <NumberField
                      value={budget[key]}
                      onChange={(value) =>
                        setBudget((prev) => ({ ...prev, [key]: value }))
                      }
                    />
                  </div>
                </label>
              ))}
            </div>
          </Field>

          <div className="well p-3.5 space-y-3">
            <Switch
              checked={allowBrowser}
              onChange={setAllowBrowser}
              tone="danger"
              label="Allow browser-originated requests"
              description="Leave off unless you routinely approve browser apps."
            />
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-slate-600 dark:text-slate-300">
                Suspend after
              </span>
              <div className="w-20">
                <NumberField
                  value={inactivityDays}
                  min={0}
                  onChange={setInactivityDays}
                  placeholder="0"
                />
              </div>
              <span className="text-[13px] text-slate-600 dark:text-slate-300">
                idle days
                <span className="text-slate-400"> (0 = never)</span>
              </span>
            </div>
          </div>

          <div>
            <p className="eyebrow mb-1.5">This template will apply</p>
            <ul className="flex flex-wrap gap-1.5">
              {summarizeTemplate(values).map((chip) => (
                <li key={chip} className="badge-neutral">
                  {chip}
                </li>
              ))}
            </ul>
          </div>

          <details>
            <summary className="field-hint cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-300">
              Raw values JSON
            </summary>
            <pre className="code-block mt-2">
              {JSON.stringify(values, null, 2)}
            </pre>
          </details>

          {error && <p className="callout-danger">{error}</p>}
        </div>

        <div className="shrink-0 flex justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!trimmedName || nameTaken || saving}
            onClick={save}
          >
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One connector: in or out of the package, and on what terms. */
function ServicePicker({
  capability,
  service,
  onToggle,
  onActionsChange,
  onConstraintsChange,
}: {
  capability: ResourceCapabilities;
  /** undefined = not in the package */
  service: TemplateService | undefined;
  onToggle: (on: boolean) => void;
  onActionsChange: (actions: string[]) => void;
  onConstraintsChange: (constraints: Record<string, unknown>) => void;
}) {
  const included = service !== undefined;
  const actions = service?.actions ?? [];

  return (
    <div
      className={`rounded-xl border transition-colors duration-150 ${
        included
          ? "border-slate-200 dark:border-slate-800"
          : "border-slate-200/70 dark:border-slate-800/70"
      }`}
    >
      <div className="flex items-start justify-between gap-3 p-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {capability.name}
            <span className="ml-2 font-mono font-normal text-[11px] text-slate-400">
              {capability.resourceId}
            </span>
          </p>
          {capability.description && (
            <p className="field-hint mt-0.5 truncate-2">
              {capability.description}
            </p>
          )}
          {!capability.configured && (
            <p className="field-hint mt-1 text-amber-600 dark:text-amber-400">
              No credentials stored yet — a grant using this service won't
              serve until you add a key.
            </p>
          )}
        </div>
        <Switch
          checked={included}
          onChange={onToggle}
          label={<span className="sr-only">Include {capability.name}</span>}
        />
      </div>

      {included && (
        <div className="px-3.5 pb-3.5 space-y-3">
          <div>
            <p className="eyebrow mb-1.5">Operations</p>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {capability.actions.map((action) => (
                <CheckCard
                  key={action.id}
                  checked={actions.includes(action.id)}
                  onChange={(checked) =>
                    onActionsChange(
                      checked
                        ? [...actions, action.id]
                        : actions.filter((a) => a !== action.id),
                    )
                  }
                  title={action.label}
                  subtitle={action.description}
                  meta={
                    <code className="text-[10px] text-slate-400">
                      {action.id}
                    </code>
                  }
                />
              ))}
            </div>
            {actions.length === 0 && (
              <p className="field-error mt-1.5">
                Pick at least one operation, or turn this service off — a
                service with none is dropped when the template is saved.
              </p>
            )}
          </div>

          {actions.length > 0 && (
            <ServiceLimits
              capability={capability}
              activeActions={actions}
              values={service?.constraints ?? {}}
              // Nothing has been requested yet — a template is authored
              // before any particular app asks.
              requestedValues={{}}
              onChange={onConstraintsChange}
            />
          )}
        </div>
      )}
    </div>
  );
}
