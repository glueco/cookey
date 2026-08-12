"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResourceCapabilities } from "@/server/connectors/capabilities";
import {
  RawJsonExpander,
  type GrantDocumentShape,
} from "@/components/document/GrantDocumentReview";
import {
  AccessOptionPicker,
  CredentialSummary,
  RequestScopeCard,
  ServiceLimits,
} from "@/components/grant/approval-parts";
import { effectiveAuth, parseDurationMs } from "@/server/grants/schema";
import {
  applyTemplateScope,
  normalizeTemplateValues,
  parseBudgetValue,
  BUDGET_FIELDS,
  COST_BUDGET_KEYS,
  DAY_MS,
  DURATION_PRESETS,
  type BudgetKey,
  type TemplateRow,
} from "@/lib/templates";
import {
  Field,
  NumberField,
  Segmented,
  Switch,
  TagInput,
  ToastProvider,
  useToast,
} from "@/components/ui";
import { TokenSuccessScreen } from "./TokenSuccessScreen";

// ============================================
// GRANT APPROVAL FORM
//
// Reads top to bottom as the decision actually gets made:
//   1 which services & verbs → 2 limits per service
//   → 3 how long  → 4 how much  → 5 how locked down
// with the verdict parked in a rail that never leaves the screen.
//
// The form OPENS at exactly what the app asked for. That request is the
// proposal on the table; everything here subtracts from it, and the
// server re-checks that on approve. Two optional shortcuts sit on top:
// an app may offer named access levels (pick one to drop the rest), and
// the owner may apply a saved permission template (intersects the
// request with a package they've already decided they're happy with).
// Neither is required, and "Reset to what was requested" puts the whole
// form back to the proposal.
//
// Credential type is NOT on this screen as a choice — see
// CredentialSummary. It's a property of the app, not a preference.
// ============================================

interface Props {
  grantId: string;
  document: GrantDocumentShape;
  /** Enabled connectors + what each can actually enforce */
  capabilities: ResourceCapabilities[];
  requestedDurationMs: number | null;
  requestedRenewalDays: number | null;
  defaultInactivitySuspendDays: number;
}

export default function ApprovalForm(props: Props) {
  // Self-contained provider: this screen renders outside the admin
  // layout, so it brings its own toast surface.
  return (
    <ToastProvider>
      <ApprovalFormInner {...props} />
    </ToastProvider>
  );
}

function ApprovalFormInner({
  grantId,
  document: doc,
  capabilities,
  requestedDurationMs,
  requestedRenewalDays,
  defaultInactivitySuspendDays,
}: Props) {
  const toast = useToast();
  const accessOptions = doc.options ?? [];

  // Credential type is derived from the document, exactly as the server
  // derives it on approve. Nothing on this screen can change it.
  const auth = effectiveAuth(doc);

  const capabilityById = useMemo(
    () => new Map(capabilities.map((c) => [c.resourceId, c])),
    [capabilities],
  );
  const capabilityFor = (resourceId: string) => capabilityById.get(resourceId);

  // ---- the app's own proposal, as a form state ------------------------
  //
  // Computed once and kept, because it is two things at the same time:
  // the state the form opens in, and the target "Reset to what was
  // requested" returns to. An app that marks an access level as
  // recommended is making a suggestion about its own request, so that
  // is the opening position; otherwise the whole request stands.

  const requested = useMemo(() => {
    const option = accessOptions.find((o) => o.recommended);
    const budgetSource = option?.budget ?? doc.budget;
    const optionDurationMs = option?.duration
      ? parseDurationMs(option.duration)
      : undefined;

    const bindings: Record<string, string[]> = {};
    doc.requests.forEach((request, index) => {
      if (!request.resource.endsWith(":*")) return;
      const type = request.resource.slice(0, -2);
      bindings[String(index)] = capabilities
        .filter((c) => c.resourceType === type && c.configured)
        .map((c) => c.resourceId);
    });

    return {
      optionId: option?.id ?? null,
      // Every request starts at exactly what the app asked for — the
      // owner subtracts from there, so the default approval is never
      // wider than the request document.
      actions: Object.fromEntries(
        doc.requests.map((request, index) => [
          String(index),
          [...request.actions],
        ]),
      ) as Record<string, string[]>,
      bindings,
      constraints: {} as Record<string, Record<string, unknown>>,
      durationMs:
        optionDurationMs !== undefined
          ? optionDurationMs
          : (requestedDurationMs ?? 30 * DAY_MS),
      renewable: requestedRenewalDays !== null,
      renewalDays: requestedRenewalDays ?? 30,
      budget: Object.fromEntries(
        BUDGET_FIELDS.map(([key]) => [
          key,
          budgetSource?.[key]?.toString() ?? "",
        ]),
      ) as Record<BudgetKey, string>,
      egressIps: [] as string[],
      allowBrowser: doc.runtime === "browser",
      inactivityDays: String(defaultInactivitySuspendDays),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedOption, setSelectedOption] = useState<string | null>(
    requested.optionId,
  );
  const [durationMs, setDurationMs] = useState<number | null>(
    requested.durationMs,
  );
  const [renewable, setRenewable] = useState(requested.renewable);
  const [renewalDays, setRenewalDays] = useState(requested.renewalDays);
  const [budget, setBudget] = useState<Record<BudgetKey, string>>(
    requested.budget,
  );
  const [loosenedAck, setLoosenedAck] = useState(false);
  const [egressIps, setEgressIps] = useState<string[]>(requested.egressIps);
  const [allowBrowser, setAllowBrowser] = useState(requested.allowBrowser);
  const [inactivityDays, setInactivityDays] = useState(
    requested.inactivityDays,
  );
  const [actionsByRequest, setActionsByRequest] = useState<
    Record<string, string[]>
  >(requested.actions);
  const [bindings, setBindings] = useState<Record<string, string[]>>(
    requested.bindings,
  );
  const [constraints, setConstraints] = useState<
    Record<string, Record<string, unknown>>
  >(requested.constraints);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [namingTemplate, setNamingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [finished, setFinished] = useState<"approved" | "denied" | null>(null);

  // ---- derived scope ---------------------------------------------------

  const activeOption = accessOptions.find((o) => o.id === selectedOption);
  const inOption = (index: number) =>
    !activeOption || activeOption.requests.includes(index);

  const actionsFor = (index: number) => actionsByRequest[String(index)] ?? [];

  const boundResourcesFor = (index: number): string[] => {
    const request = doc.requests[index];
    if (!request) return [];
    return request.resource.endsWith(":*")
      ? (bindings[String(index)] ?? [])
      : [request.resource];
  };

  /**
   * resourceId → the verbs actually granted on it, plus whatever the app
   * proposed as constraints for it. Drives the per-service limits list.
   */
  const services = useMemo(() => {
    const map = new Map<
      string,
      { actions: Set<string>; requested: Record<string, unknown> }
    >();
    doc.requests.forEach((request, index) => {
      if (!inOption(index)) return;
      const actions = actionsFor(index);
      if (actions.length === 0) return;
      for (const resourceId of boundResourcesFor(index)) {
        if (resourceId.endsWith(":*")) continue;
        const entry = map.get(resourceId) ?? {
          actions: new Set<string>(),
          requested: {},
        };
        actions.forEach((action) => entry.actions.add(action));
        Object.assign(entry.requested, request.constraints ?? {});
        map.set(resourceId, entry);
      }
    });
    return [...map.entries()].map(([resourceId, entry]) => ({
      resourceId,
      actions: [...entry.actions],
      requested: entry.requested,
      capability: capabilityById.get(resourceId),
    }));
  }, [doc.requests, actionsByRequest, bindings, selectedOption, capabilityById]);

  const grantedPermissionCount = services.reduce(
    (sum, service) => sum + service.actions.length,
    0,
  );

  // A wildcard request with verbs enabled but nothing bound would mint
  // nothing — flag it rather than failing at the server.
  const unboundRequest = doc.requests.some(
    (request, index) =>
      inOption(index) &&
      request.resource.endsWith(":*") &&
      actionsFor(index).length > 0 &&
      boundResourcesFor(index).length === 0,
  );

  // ---- templates -------------------------------------------------------

  useEffect(() => {
    fetch("/api/admin/templates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setTemplates(
          (data.templates ?? []).map((template: TemplateRow) => ({
            ...template,
            values: normalizeTemplateValues(template.values),
          })),
        );
      })
      .catch(() => {});
  }, []);

  /** Put every field back to the app's own proposal. */
  const resetToRequested = () => {
    setSelectedOption(requested.optionId);
    setActionsByRequest(requested.actions);
    setBindings(requested.bindings);
    setConstraints(requested.constraints);
    setDurationMs(requested.durationMs);
    setRenewable(requested.renewable);
    setRenewalDays(requested.renewalDays);
    setBudget(requested.budget);
    setEgressIps(requested.egressIps);
    setAllowBrowser(requested.allowBrowser);
    setInactivityDays(requested.inactivityDays);
    setLoosenedAck(false);
    setAppliedTemplate(null);
  };

  /**
   * Apply a saved package. Scope is INTERSECTED with the request — a
   * template can drop services and operations, never add them — and the
   * result is reported rather than applied silently, because "your
   * template quietly removed two of the four things this app asked for"
   * is exactly the kind of surprise that gets a grant approved wrong.
   */
  const applyTemplate = (template: TemplateRow) => {
    const v = template.values;
    const notes: string[] = [];

    const scope = applyTemplateScope(
      v,
      doc.requests,
      capabilities.filter((c) => c.configured).map((c) => c.resourceId),
    );

    if (scope) {
      // Dropping to a template's package overrides any access level:
      // two different narrowings of the same request would just fight.
      setSelectedOption(null);
      setActionsByRequest(scope.actions);
      setBindings((prev) => ({ ...prev, ...scope.bindings }));
      setConstraints(scope.constraints);
      if (scope.dropped.length > 0) {
        notes.push(
          `dropped ${scope.dropped.length} request${
            scope.dropped.length === 1 ? "" : "s"
          } the package doesn't cover`,
        );
      }
      if (scope.narrowed > 0) {
        notes.push(`removed ${scope.narrowed} operation${scope.narrowed === 1 ? "" : "s"}`);
      }
      if (notes.length === 0) notes.push("the request fits the package as-is");
    }

    if (v.durationMs !== undefined) setDurationMs(v.durationMs);
    if (v.renewal !== undefined) {
      setRenewable(!!v.renewal);
      if (v.renewal) setRenewalDays(v.renewal.periodDays);
    }
    if (v.budget) {
      const b = v.budget;
      setBudget(
        Object.fromEntries(
          BUDGET_FIELDS.map(([key]) => [key, b[key]?.toString() ?? ""]),
        ) as Record<BudgetKey, string>,
      );
    }
    if (v.inactivitySuspendDays !== undefined) {
      setInactivityDays(String(v.inactivitySuspendDays));
    }
    if (v.allowBrowser !== undefined) setAllowBrowser(v.allowBrowser);

    setAppliedTemplate(template.name);
    toast.success(
      `Applied “${template.name}”`,
      [scope ? notes.join(", ") : "settings only — scope untouched", "Every field stays editable."]
        .join(". "),
    );
  };

  /** Save the current answers — package included — as a new template. */
  const saveAsTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    try {
      const response = await fetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          values: {
            services: services.map((service) => ({
              resourceId: service.resourceId,
              actions: service.actions,
              ...(Object.keys(constraints[service.resourceId] ?? {}).length > 0
                ? { constraints: constraints[service.resourceId] }
                : {}),
            })),
            durationMs,
            renewal: renewable ? { periodDays: renewalDays } : null,
            budget: budgetNumbers(),
            inactivitySuspendDays: parseInt(inactivityDays || "0", 10),
            allowBrowser,
          },
        }),
      });
      if (!response.ok) throw new Error("Save failed");
      const refreshed = await fetch("/api/admin/templates");
      if (refreshed.ok) {
        const data = await refreshed.json();
        setTemplates(
          (data.templates ?? []).map((template: TemplateRow) => ({
            ...template,
            values: normalizeTemplateValues(template.values),
          })),
        );
      }
      setNamingTemplate(false);
      setTemplateName("");
      toast.success(
        `Saved “${name}”`,
        "Services, operations and limits included — reusable on your next approval.",
      );
    } catch {
      toast.error("Couldn't save the template");
    }
  };

  // ---- drift from the request -----------------------------------------

  /**
   * Has anything moved off the app's proposal? Drives whether "Reset to
   * what was requested" is offered — an always-live reset button on an
   * untouched form is just noise.
   */
  const changedFromRequested = useMemo(() => {
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a) === JSON.stringify(b);
    return !(
      selectedOption === requested.optionId &&
      same(actionsByRequest, requested.actions) &&
      same(bindings, requested.bindings) &&
      same(constraints, requested.constraints) &&
      durationMs === requested.durationMs &&
      renewable === requested.renewable &&
      renewalDays === requested.renewalDays &&
      same(budget, requested.budget) &&
      same(egressIps, requested.egressIps) &&
      allowBrowser === requested.allowBrowser &&
      inactivityDays === requested.inactivityDays
    );
  }, [
    requested,
    selectedOption,
    actionsByRequest,
    bindings,
    constraints,
    durationMs,
    renewable,
    renewalDays,
    budget,
    egressIps,
    allowBrowser,
    inactivityDays,
  ]);

  // ---- warnings & projection ------------------------------------------

  const loosened = useMemo(() => {
    const baseline = activeOption?.budget ?? doc.budget;
    return BUDGET_FIELDS.some(([key]) => {
      const asked = baseline?.[key];
      if (asked === undefined) return false;
      const value = budget[key].trim();
      if (value === "") return true; // removing a requested cap widens it
      return parseBudgetValue(key, value) > asked;
    });
  }, [budget, doc.budget, activeOption]);

  /**
   * Worst-case daily spend: every budgeted token billed at the priciest
   * output rate still reachable after the owner's model selection. It is
   * intentionally pessimistic — this number exists to be an upper bound
   * the owner can sleep on, not a forecast.
   */
  const projection = useMemo(() => {
    const dailyTokens = parseInt(budget.dailyTokens || "0", 10) || null;
    const dailyRequests = parseInt(budget.dailyRequests || "0", 10) || null;

    const rows = services
      .filter((service) => service.resourceId.startsWith("llm:"))
      .map((service) => {
        const pricing = service.capability?.pricing;
        if (!pricing || Object.keys(pricing).length === 0) {
          return { resourceId: service.resourceId, perDay: null };
        }
        const owner = constraints[service.resourceId] ?? {};
        const allowed =
          (Array.isArray(owner.allowedModels) && owner.allowedModels.length
            ? (owner.allowedModels as string[])
            : undefined) ??
          (Array.isArray(service.requested.allowedModels) &&
          (service.requested.allowedModels as string[]).length
            ? (service.requested.allowedModels as string[])
            : undefined) ??
          Object.keys(pricing);

        // A model priced at $0 is explicitly FREE (the owner said so on
        // the connector page) — that's a real $0.00 bound, not "no
        // data". Only models with no pricing entry at all are unknown.
        const priced = allowed.filter((model) => pricing[model]);
        if (priced.length === 0) {
          return { resourceId: service.resourceId, perDay: null };
        }
        const maxRate = Math.max(
          ...priced.map((model) => pricing[model].outputPerMTok),
        );

        const maxOut =
          (typeof owner.maxOutputTokens === "number"
            ? owner.maxOutputTokens
            : undefined) ??
          (typeof service.requested.maxOutputTokens === "number"
            ? (service.requested.maxOutputTokens as number)
            : undefined) ??
          4096;

        let perDay: number | null = null;
        if (dailyTokens) perDay = (dailyTokens * maxRate) / 1_000_000;
        else if (dailyRequests)
          perDay = (dailyRequests * maxOut * maxRate) / 1_000_000;
        return { resourceId: service.resourceId, perDay };
      });

    const known = rows.filter((row) => row.perDay !== null);
    let total = known.reduce((sum, row) => sum + (row.perDay ?? 0), 0);
    let hasKnown = known.length > 0;
    let unbounded = !dailyTokens && !dailyRequests;

    // A spend cap is enforced by the gateway itself, so it IS the
    // worst case — it bounds even what the token math can't price.
    const costCap = parseFloat(budget.dailyCostUsd || "") || null;
    if (costCap) {
      total = hasKnown && !unbounded ? Math.min(total, costCap) : costCap;
      hasKnown = true;
      unbounded = false;
    }

    return {
      rows,
      total,
      unbounded,
      hasKnown,
      hasLlm: rows.length > 0,
    };
  }, [
    services,
    budget.dailyTokens,
    budget.dailyRequests,
    budget.dailyCostUsd,
    constraints,
  ]);

  // ---- submit ----------------------------------------------------------

  function budgetNumbers(): Record<string, number> {
    return Object.fromEntries(
      Object.entries(budget)
        .filter(([, value]) => value.trim() !== "")
        .map(([key, value]) => [
          key,
          parseBudgetValue(key as BudgetKey, value),
        ])
        .filter(([, value]) => Number.isFinite(value) && (value as number) > 0),
    );
  }

  const expiryLabel = durationMs
    ? new Date(Date.now() + durationMs).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "never";

  async function submit(decision: "approve" | "deny") {
    setSubmitting(decision);
    setError(null);
    try {
      const caps = budgetNumbers();
      // Only bound services carry constraints — a stale entry for a
      // provider the owner unchecked must not travel with the approval.
      const boundConstraints: Record<string, Record<string, unknown>> = {};
      for (const service of services) {
        const values = constraints[service.resourceId];
        if (values && Object.keys(values).length > 0) {
          boundConstraints[service.resourceId] = values;
        }
      }

      const response = await fetch("/api/connect/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: grantId,
          decision,
          ...(decision === "approve" && {
            decisions: {
              ...(selectedOption && { optionId: selectedOption }),
              bindings,
              actions: actionsByRequest,
              // No `auth`: the server derives it from the document.
              durationMs,
              renewal: renewable ? { periodDays: renewalDays } : null,
              ...(Object.keys(caps).length > 0 && { budget: caps }),
              ...(Object.keys(boundConstraints).length > 0 && {
                constraints: boundConstraints,
              }),
              ...(egressIps.length > 0 && { egressIps: egressIps.join(",") }),
              allowBrowser,
              inactivitySuspendDays: parseInt(inactivityDays || "0", 10),
              ...(loosened && { loosenedAcknowledged: true }),
            },
          }),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const details = Array.isArray(data.details)
          ? (data.details as Array<{ path: string; message: string }>)
              .map((detail) => `${detail.path}: ${detail.message}`)
              .join("\n")
          : "";
        throw new Error(
          [data.error || "Request failed", details].filter(Boolean).join("\n"),
        );
      }

      if (decision === "deny") return setFinished("denied");
      if (data.redirectUri) {
        window.location.href = data.redirectUri;
        return;
      }
      if (data.token) return setIssuedToken(data.token);
      setFinished("approved");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error("Approval failed", message);
    } finally {
      setSubmitting(null);
    }
  }

  // ---- terminal states -------------------------------------------------

  if (issuedToken) {
    return (
      <TokenSuccessScreen
        token={issuedToken}
        appName={doc.app.name}
        boundResources={services.map((service) => service.resourceId)}
      />
    );
  }

  if (finished) {
    const approved = finished === "approved";
    return (
      <div className="text-center py-10 animate-scale-in">
        <div
          className={`w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center ${
            approved
              ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-slate-100 dark:bg-slate-800 text-slate-500"
          }`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {approved ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            )}
          </svg>
        </div>
        <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          {approved ? "Access granted" : "Request denied"}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
          {approved
            ? `${doc.app.name} can now connect ${
                auth === "pop"
                  ? "with its signing keys"
                  : "with the token it was issued"
              }.`
            : `${doc.app.name} was told the connection was declined.`}
        </p>
      </div>
    );
  }

  // ---- main ------------------------------------------------------------

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_18rem] gap-8 items-start">
      <div className="space-y-8 min-w-0">
        {/* 1 — access level (only when the app offers tiers) */}
        {accessOptions.length > 0 && (
          <Step
            n={1}
            title="Access level"
            optional
            hint={`${doc.app.name} offers more than one way to connect. Picking one is a shortcut, not a requirement — it just drops the requests outside that tier. Leave it on “everything requested” to review the full request below.`}
          >
            <AccessOptionPicker
              options={accessOptions}
              requests={doc.requests}
              selected={selectedOption}
              onSelect={(id) => {
                setSelectedOption(id);
                // Choosing a tier is a different narrowing from a saved
                // package; keeping the badge would misreport what's on
                // screen.
                setAppliedTemplate(null);
                const option = accessOptions.find((o) => o.id === id);
                // "Everything requested" (id === null) restores the
                // document's own ceilings rather than an option's.
                const b = option ? (option.budget ?? doc.budget) : doc.budget;
                setBudget(
                  Object.fromEntries(
                    BUDGET_FIELDS.map(([key]) => [
                      key,
                      b?.[key]?.toString() ?? "",
                    ]),
                  ) as Record<BudgetKey, string>,
                );
                const duration = option?.duration ?? doc.duration;
                if (duration) {
                  const ms = parseDurationMs(duration);
                  if (ms !== undefined) setDurationMs(ms);
                }
              }}
            />
          </Step>
        )}

        {/* 2 — services & verbs */}
        <Step
          n={accessOptions.length > 0 ? 2 : 1}
          title={`What ${doc.app.name} may do`}
          hint="Each entry is one thing the app asked for, in its own words. Turn off anything it doesn't need, and choose which of your providers it reaches."
        >
          <div className="space-y-3">
            {doc.requests.map((request, index) => (
              <RequestScopeCard
                key={index}
                request={request}
                index={index}
                inOption={inOption(index)}
                selectedActions={actionsFor(index)}
                onActionsChange={(actions) =>
                  setActionsByRequest((prev) => ({
                    ...prev,
                    [String(index)]: actions,
                  }))
                }
                boundResources={boundResourcesFor(index)}
                onBindingsChange={(resourceIds) =>
                  setBindings((prev) => ({
                    ...prev,
                    [String(index)]: resourceIds,
                  }))
                }
                candidates={capabilities.filter(
                  (c) => c.resourceType === request.resource.slice(0, -2),
                )}
                capabilityFor={capabilityFor}
              />
            ))}
          </div>
        </Step>

        {/* 3 — per-service limits */}
        {services.length > 0 && (
          <Step
            n={accessOptions.length > 0 ? 3 : 2}
            title="Limits per service"
            hint="These are the ceilings the gateway enforces on every single request — before it ever reaches the provider, and regardless of what the app sends. Each line states what's in force; open one to change it."
          >
            <div className="space-y-2">
              {services.map((service) =>
                service.capability ? (
                  <ServiceLimits
                    key={service.resourceId}
                    capability={service.capability}
                    activeActions={service.actions}
                    values={constraints[service.resourceId] ?? {}}
                    requestedValues={service.requested}
                    // A single bound service is the whole section — no
                    // point making the owner click to see it.
                    defaultOpen={services.length === 1}
                    onChange={(values) =>
                      setConstraints((prev) => ({
                        ...prev,
                        [service.resourceId]: values,
                      }))
                    }
                  />
                ) : (
                  <p key={service.resourceId} className="callout-warning">
                    <code className="font-mono">{service.resourceId}</code> has
                    no enabled connector on this gateway — the app will get a
                    permission it cannot use until you install one.
                  </p>
                ),
              )}
            </div>
          </Step>
        )}

        {/* 4 — duration */}
        <Step
          n={accessOptions.length > 0 ? 4 : 3}
          title="How long"
          hint={
            durationMs === null
              ? "A grant that never expires is one you have to remember to revoke."
              : `Access ends on ${expiryLabel} unless you renew it.`
          }
        >
          <div className="space-y-4">
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
            {/* The app may have asked for something no preset covers —
                offer it explicitly rather than silently rounding. */}
            {requestedDurationMs !== durationMs &&
              !DURATION_PRESETS.some((p) => p.ms === requestedDurationMs) && (
                <button
                  type="button"
                  className="text-xs text-primary-600 dark:text-primary-400 underline underline-offset-2"
                  onClick={() => setDurationMs(requestedDurationMs)}
                >
                  Use exactly what was requested ({doc.duration})
                </button>
              )}

            <div className="well p-3.5 space-y-3">
              <Switch
                checked={renewable}
                onChange={setRenewable}
                label="Renewable"
                description="The token lives one period at a time and lapses unless you renew — the safest shape for long-running access."
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
                      placeholder="30"
                    />
                  </div>
                  <span className="text-[13px] text-slate-600 dark:text-slate-300">
                    days
                  </span>
                </div>
              )}
            </div>
          </div>
        </Step>

        {/* 5 — budget */}
        <Step
          n={accessOptions.length > 0 ? 5 : 4}
          title="How much"
          hint="Caps are enforced per resource and reset on their own schedule. Leave a field empty for no limit."
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {BUDGET_FIELDS.map(([key, label]) => (
                <Field key={key} label={label}>
                  <NumberField
                    value={budget[key]}
                    min={COST_BUDGET_KEYS.includes(key) ? 0 : 1}
                    onChange={(value) =>
                      setBudget((prev) => ({ ...prev, [key]: value }))
                    }
                  />
                </Field>
              ))}
            </div>

            {BUDGET_FIELDS.every(([key]) => !budget[key]) && (
              <p className="callout-warning">
                No caps set — this grant can spend without limit. A daily
                spend cap is the single most useful guardrail here.
              </p>
            )}

            {loosened && (
              <label className="callout-warning flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={loosenedAck}
                  onChange={(event) => setLoosenedAck(event.target.checked)}
                />
                <span>
                  These limits are looser than {doc.app.name} asked for. I know,
                  and I want that.
                </span>
              </label>
            )}

            {projection.hasLlm && (
              <div className="well p-3.5">
                <p className="eyebrow mb-1.5">Worst-case spend</p>
                {projection.unbounded ? (
                  <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                    Unbounded — with no daily cap there is no ceiling to
                    project.
                  </p>
                ) : projection.hasKnown ? (
                  <>
                    <p className="text-sm text-slate-800 dark:text-slate-100">
                      Up to{" "}
                      <span className="font-semibold tabular-nums">
                        ${projection.total.toFixed(2)}
                      </span>
                      /day
                      <span className="text-slate-500 dark:text-slate-400">
                        {" "}
                        (≈ ${(projection.total * 30).toFixed(0)}/month) on your
                        keys
                      </span>
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {projection.rows.map((row) => (
                        <li
                          key={row.resourceId}
                          className="text-xs text-slate-500 dark:text-slate-400 flex justify-between gap-3"
                        >
                          <span className="font-mono truncate">
                            {row.resourceId}
                          </span>
                          <span className="tabular-nums shrink-0">
                            {row.perDay !== null
                              ? `$${row.perDay.toFixed(2)}/day`
                              : "no pricing data"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="field-hint">
                    No pricing data for the bound connectors — no estimate
                    available.
                  </p>
                )}
              </div>
            )}
          </div>
        </Step>

        {/* 6 — security */}
        <Step
          n={accessOptions.length > 0 ? 6 : 5}
          title="Security"
          hint="How the app proves it's the app, and where it's allowed to call from."
        >
          <div className="space-y-4">
            <CredentialSummary
              auth={auth}
              appName={doc.app.name}
              expiryLabel={durationMs === null ? "never" : expiryLabel}
              renewable={renewable}
            />

            <Field
              label="Egress IP allowlist"
              hint={
                doc.runtime === "server"
                  ? "Recommended — this app runs on a server, so its outbound IPs are stable. Requests from anywhere else are rejected outright."
                  : "Requests from any other address are rejected. Leave empty to allow any origin."
              }
            >
              <TagInput
                values={egressIps}
                onChange={setEgressIps}
                placeholder="203.0.113.7 or 198.51.100.0/24"
              />
            </Field>

            <div className="well p-3.5 space-y-3">
              <Switch
                checked={allowBrowser}
                onChange={setAllowBrowser}
                tone="danger"
                label="Allow browser-originated requests"
                description="Only for apps that genuinely run in the browser."
              />
              {allowBrowser && (
                <p className="callout-danger ml-12">
                  Anyone who can run JavaScript against this grant's token can
                  use it from any website.
                </p>
              )}
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
          </div>
        </Step>

        <RawJsonExpander value={doc} />
      </div>

      {/* ---- decision rail ---------------------------------------------- */}
      <aside className="lg:sticky lg:top-6 space-y-3">
        <div className="card p-4 space-y-3 shadow-sm">
          <p className="eyebrow">Summary</p>
          <dl className="space-y-2 text-[13px]">
            <SummaryRow
              label="Services"
              value={
                services.length === 0
                  ? "none"
                  : services
                      .map((s) => s.capability?.name ?? s.resourceId)
                      .join(", ")
              }
            />
            <SummaryRow
              label="Operations"
              value={`${grantedPermissionCount} granted`}
            />
            <SummaryRow
              label="Expires"
              value={durationMs === null ? "never" : expiryLabel}
            />
            <SummaryRow
              label="Credential"
              value={auth === "pop" ? "Signing keys" : "Static token"}
              tone={auth === "pop" ? undefined : "warn"}
            />
            <SummaryRow
              label="Worst case"
              value={
                !projection.hasLlm
                  ? "no metered spend"
                  : projection.unbounded
                    ? "unbounded"
                    : projection.hasKnown
                      ? `≈ $${projection.total.toFixed(2)}/day`
                      : "unknown"
              }
              tone={projection.unbounded ? "warn" : undefined}
            />
          </dl>

          {/* Reset is the counterweight to every narrowing control on
              this screen — templates, access levels and hand edits all
              subtract, and this is the one way back to the proposal. */}
          {changedFromRequested && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
              {appliedTemplate && (
                <p className="field-hint">
                  Template applied:{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {appliedTemplate}
                  </span>
                </p>
              )}
              <button
                className="btn-secondary btn-sm w-full"
                onClick={resetToRequested}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                Reset to what was requested
              </button>
            </div>
          )}

          {templates.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <Field
                label="Apply a template"
                hint="Narrows this request to a package you've already decided on."
              >
                <select
                  className="input"
                  value=""
                  onChange={(event) => {
                    const template = templates.find(
                      (t) => t.id === event.target.value,
                    );
                    if (template) applyTemplate(template);
                  }}
                >
                  <option value="">— none —</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {namingTemplate ? (
            <div className="flex gap-1.5">
              <input
                autoFocus
                className="input"
                placeholder="Template name"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveAsTemplate();
                  if (event.key === "Escape") setNamingTemplate(false);
                }}
              />
              <button
                className="btn-primary btn-sm"
                disabled={!templateName.trim()}
                onClick={saveAsTemplate}
              >
                Save
              </button>
            </div>
          ) : (
            <button
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 underline underline-offset-2"
              onClick={() => setNamingTemplate(true)}
              disabled={services.length === 0}
            >
              Save this as a reusable package
            </button>
          )}
        </div>

        {error && (
          <p className="callout-danger whitespace-pre-line break-words">
            {error}
          </p>
        )}

        {unboundRequest && (
          <p className="callout-warning">
            One “any provider” request has no provider selected.
          </p>
        )}
        {grantedPermissionCount === 0 && !unboundRequest && (
          <p className="callout-warning">
            Nothing is granted. Enable at least one operation, or deny the
            request.
          </p>
        )}

        <div className="space-y-2">
          <button
            className="btn-primary btn-lg w-full"
            disabled={
              submitting !== null ||
              unboundRequest ||
              grantedPermissionCount === 0 ||
              (loosened && !loosenedAck)
            }
            onClick={() => submit("approve")}
          >
            {submitting === "approve" ? "Approving…" : "Approve access"}
          </button>
          <button
            className="btn-secondary w-full"
            disabled={submitting !== null}
            onClick={() => submit("deny")}
          >
            {submitting === "deny" ? "Denying…" : "Deny"}
          </button>
        </div>
        <p className="field-hint text-center">
          You can revoke this at any time from Grants.
        </p>
      </aside>
    </div>
  );
}

// ---- small local pieces -------------------------------------------------

function Step({
  n,
  title,
  hint,
  optional = false,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  /** Marks a step that can be skipped outright — a shortcut, not a gate */
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2.5 mb-1">
        <span className="w-5 h-5 shrink-0 self-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-semibold flex items-center justify-center">
          {n}
        </span>
        <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h3>
        {optional && (
          <span className="text-[11px] font-normal text-slate-400">
            optional
          </span>
        )}
      </div>
      {hint && (
        <p className="field-hint mb-3.5 ml-[1.9rem] max-w-2xl">{hint}</p>
      )}
      <div className="ml-0 sm:ml-[1.9rem]">{children}</div>
    </section>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500 dark:text-slate-400 shrink-0">{label}</dt>
      <dd
        className={`text-right min-w-0 truncate ${
          tone === "warn"
            ? "text-amber-600 dark:text-amber-400 font-medium"
            : "text-slate-800 dark:text-slate-200"
        }`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

