"use client";

import type {
  ConstraintSpec,
  ResourceCapabilities,
} from "@/server/connectors/capabilities";
import {
  describeResource,
  type GrantDocumentShape,
} from "@/components/document/GrantDocumentReview";
import { CheckCard, NumberField, PillSelect, Switch, TagInput } from "@/components/ui";

// ============================================
// APPROVAL SCREEN PARTS
// The pieces that make the consent decision legible: which bundle,
// which services, which verbs, and what ceiling each service runs under.
//
// `import type` on the capabilities module is deliberate — the types are
// erased at build time, so no server code reaches the client bundle.
// ============================================

type GrantRequest = GrantDocumentShape["requests"][number];
type GrantOption = NonNullable<GrantDocumentShape["options"]>[number];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  llm: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
  ),
  mail: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  ),
  http: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0a8.949 8.949 0 004.951-1.488A3.987 3.987 0 0013 16h-2a3.987 3.987 0 00-3.951 3.512A8.949 8.949 0 0012 21zm3-11.25a3 3 0 11-6 0 3 3 0 016 0z" />
  ),
};

export function ResourceTypeIcon({
  resourceType,
  className = "w-4 h-4",
}: {
  resourceType: string;
  className?: string;
}) {
  const icon = TYPE_ICONS[resourceType] ?? TYPE_ICONS.http;
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {icon}
    </svg>
  );
}

// ---- 1. Access level (optional) ----------------------------------------

/**
 * The tiers an app proposes, plus the standing option of approving the
 * request as written.
 *
 * "Everything requested" is a real card and not an absent state on
 * purpose: the app's own request document is the proposal being
 * reviewed, so it deserves to be visible and selectable rather than
 * being what you get for failing to choose.
 */
export function AccessOptionPicker({
  options,
  requests,
  selected,
  onSelect,
}: {
  options: GrantOption[];
  requests: GrantRequest[];
  /** null = everything the document asked for */
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const allResources = [
    ...new Set(requests.map((request) => describeResource(request.resource))),
  ];
  const totalOperations = requests.reduce(
    (sum, request) => sum + request.actions.length,
    0,
  );

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <OptionCard
        active={selected === null}
        onSelect={() => onSelect(null)}
        name="Everything requested"
        description="Review the app's full request below and tighten it yourself."
        badge={<span className="badge-neutral">Default</span>}
        rows={[
          ["Includes", allResources.join(", ")],
          [
            "Operations",
            `${totalOperations} across ${requests.length} request${
              requests.length === 1 ? "" : "s"
            }`,
          ],
        ]}
      />

      {options.map((option) => {
        const included = [
          ...new Set(
            option.requests
              .filter((i) => i < requests.length)
              .map((i) => describeResource(requests[i].resource)),
          ),
        ];
        return (
          <OptionCard
            key={option.id}
            active={option.id === selected}
            onSelect={() => onSelect(option.id)}
            name={option.name}
            description={option.description}
            badge={
              option.recommended ? (
                <span className="badge-info">Suggested by the app</span>
              ) : null
            }
            rows={[
              ["Includes", included.join(", ")],
              ...(option.duration
                ? ([["For", option.duration]] as Array<[string, string]>)
                : []),
              ...(option.budget?.dailyRequests
                ? ([
                    [
                      "Caps",
                      `${option.budget.dailyRequests.toLocaleString()} requests/day`,
                    ],
                  ] as Array<[string, string]>)
                : []),
            ]}
          />
        );
      })}
    </div>
  );
}

function OptionCard({
  active,
  onSelect,
  name,
  description,
  badge,
  rows,
}: {
  active: boolean;
  onSelect: () => void;
  name: string;
  description?: string;
  badge?: React.ReactNode;
  rows: Array<[string, string]>;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={active ? "card-select-active" : "card-select"}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-white">
          {name}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {badge}
          <span
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
              active ? "accent-border" : "border-slate-300 dark:border-slate-600"
            }`}
          >
            {active && <span className="accent-fill w-2 h-2 rounded-full" />}
          </span>
        </span>
      </div>
      {description && (
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
          {description}
        </p>
      )}
      <dl className="mt-3 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-1.5">
            <dt className="shrink-0">{label}</dt>
            <dd className="text-slate-700 dark:text-slate-300 truncate">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </button>
  );
}

// ---- 1b. Credential type (stated, never chosen) ------------------------

/**
 * What credential this app will hold, and what that means for you.
 *
 * This is deliberately NOT a control. Proof-of-possession works only if
 * the app signs every request with a key it shipped in its own grant
 * document; an owner who "prefers" PoP for an app that doesn't do it
 * would be choosing a credential the app cannot use. So the screen
 * reports the outcome, explains it on hover, and says plainly what a
 * static token means for the owner — which is the part that actually
 * needs a warning.
 */
export function CredentialSummary({
  auth,
  appName,
  expiryLabel,
  renewable,
}: {
  auth: "bearer" | "pop";
  appName: string;
  /** "never", or the date access ends */
  expiryLabel: string;
  renewable: boolean;
}) {
  const pop = auth === "pop";

  return (
    <div className="space-y-2.5">
      <div className="well p-3.5 flex items-start gap-3">
        <span
          className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${
            pop
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
              : "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
          }`}
        >
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
            {pop ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            )}
          </svg>
        </span>

        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
            {pop ? "Signing keys (proof of possession)" : "Static token"}
            <span
              tabIndex={0}
              role="note"
              className="info-dot tooltip tooltip-rich"
              data-tooltip={
                pop
                  ? "This app shipped a public key and signs every request with the matching private key. Nothing reusable travels over the wire or lands in a log — a captured request cannot be replayed."
                  : "This app has no signing key, so it authenticates with a bearer token: a single secret string sent on every request. Whoever holds a copy of that string has this app's access, including anything that reads your logs."
              }
              aria-label="What this means"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25h1.5v4.5m-1.5 0h3m-9-3.75a9 9 0 1118 0 9 9 0 01-18 0zm9-4.5h.008v.008H11.25V7.5z" />
              </svg>
            </span>
          </p>
          <p className="field-hint mt-0.5">
            {pop
              ? `${appName} proves its identity on every request. This is decided by the app, not here.`
              : `${appName} sent no signing key, so a bearer token is the only credential it can use. This is decided by the app, not here.`}
          </p>
        </div>
      </div>

      {/* The warning that actually matters: a static token is a secret
          in flight, and its blast radius is the grant's lifetime. */}
      {!pop && (
        <p
          className={renewable ? "callout-warning" : "callout-danger"}
        >
          <strong>A static token is a copyable secret.</strong>{" "}
          {renewable
            ? "This one lives one renewal period at a time and lapses unless you renew it, which is what keeps the exposure bounded."
            : expiryLabel === "never"
              ? "This one never expires: anyone who obtains it keeps your access until you notice and revoke it. Set an expiry below, or make it renewable."
              : `Anyone who obtains it has this access until ${expiryLabel}. Shorten the duration below, or make it renewable, to bound that.`}{" "}
          Keep it in a secret store, never in client-side code or a repo.
        </p>
      )}
    </div>
  );
}

// ---- 2. Per-request scope ---------------------------------------------

export function RequestScopeCard({
  request,
  index,
  inOption,
  selectedActions,
  onActionsChange,
  boundResources,
  onBindingsChange,
  candidates,
  capabilityFor,
}: {
  request: GrantRequest;
  index: number;
  /** false = excluded by the chosen access level (shown, not editable) */
  inOption: boolean;
  selectedActions: string[];
  onActionsChange: (actions: string[]) => void;
  boundResources: string[];
  onBindingsChange: (resourceIds: string[]) => void;
  /** Providers this wildcard request may be bound to */
  candidates: ResourceCapabilities[];
  capabilityFor: (resourceId: string) => ResourceCapabilities | undefined;
}) {
  const isWildcard = request.resource.endsWith(":*");
  const resourceType = isWildcard
    ? request.resource.slice(0, -2)
    : request.resource.split(":")[0];
  const enabled = selectedActions.length > 0;

  // Action labels come from the bound connector when we have one, so a
  // custom connector's verbs read the way its author named them.
  const actionLabel = (action: string): { label: string; hint?: string } => {
    for (const resourceId of boundResources) {
      const found = capabilityFor(resourceId)?.actions.find(
        (a) => a.id === action,
      );
      if (found) return { label: found.label, hint: found.description };
    }
    return { label: action };
  };

  return (
    <div
      className={`rounded-xl border transition-opacity duration-200 ${
        inOption
          ? "border-slate-200 dark:border-slate-800"
          : "border-slate-200/70 dark:border-slate-800/70 opacity-50"
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${
            enabled && inOption
              ? "bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400"
              : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          }`}
        >
          <ResourceTypeIcon resourceType={resourceType} className="w-[18px] h-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {describeResource(request.resource)}
              </p>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                {request.resource}
              </p>
            </div>
            {inOption && (
              <Switch
                checked={enabled}
                onChange={(on) => onActionsChange(on ? request.actions : [])}
                label={<span className="sr-only">Include this access</span>}
              />
            )}
          </div>

          <blockquote className="mt-2.5 pl-3 border-l-2 border-primary-400/70 dark:border-primary-500/60 text-[13px] text-slate-600 dark:text-slate-300 italic leading-relaxed">
            “{request.reason}”
          </blockquote>

          {!inOption && (
            <p className="mt-2 eyebrow">Not part of the selected access level</p>
          )}
        </div>
      </div>

      {inOption && (
        <div className="px-4 pb-4 pl-[4.25rem] space-y-4">
          {/* --- verbs ------------------------------------------------- */}
          <div>
            <p className="eyebrow mb-1.5">
              Allowed operations
              {selectedActions.length < request.actions.length && (
                <span className="ml-1.5 normal-case tracking-normal font-normal text-amber-600 dark:text-amber-400">
                  · narrowed from what was asked
                </span>
              )}
            </p>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {request.actions.map((action) => {
                const { label, hint } = actionLabel(action);
                return (
                  <CheckCard
                    key={action}
                    checked={selectedActions.includes(action)}
                    onChange={(checked) =>
                      onActionsChange(
                        checked
                          ? [...selectedActions, action]
                          : selectedActions.filter((a) => a !== action),
                      )
                    }
                    title={label}
                    subtitle={hint}
                    meta={
                      <code className="text-[10px] text-slate-400">{action}</code>
                    }
                  />
                );
              })}
            </div>
          </div>

          {/* --- provider binding -------------------------------------- */}
          {isWildcard && (
            <div>
              <p className="eyebrow mb-1.5">
                Which {resourceType} providers
              </p>
              {candidates.length === 0 ? (
                <p className="callout-warning">
                  You have no {resourceType} provider set up yet. Add
                  credentials for one under Connectors, then reopen this
                  request.
                </p>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {candidates.map((candidate) => (
                      <CheckCard
                        key={candidate.resourceId}
                        checked={boundResources.includes(candidate.resourceId)}
                        disabled={!candidate.configured}
                        onChange={(checked) =>
                          onBindingsChange(
                            checked
                              ? [...boundResources, candidate.resourceId]
                              : boundResources.filter(
                                  (id) => id !== candidate.resourceId,
                                ),
                          )
                        }
                        title={candidate.name}
                        subtitle={
                          candidate.configured ? (
                            <code className="font-mono">
                              {candidate.resourceId}
                            </code>
                          ) : (
                            "No credentials stored — add a key first"
                          )
                        }
                      />
                    ))}
                  </div>
                  {boundResources.length === 0 && (
                    <p className="field-error mt-1.5">
                      Pick at least one provider, or turn this access off.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- 3. Per-service limits --------------------------------------------

/**
 * One control per constraint the connector can genuinely enforce. The
 * specs come from the connector's own `enforce` map, so a connector that
 * cannot cap reply length simply doesn't offer the control — the owner
 * is never shown a limit that would be silently ignored.
 */
export function ServiceLimits({
  capability,
  activeActions,
  values,
  onChange,
  requestedValues,
  defaultOpen = false,
}: {
  capability: ResourceCapabilities;
  /** Verbs actually granted on this service across all requests */
  activeActions: string[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  /** What the app itself proposed, for "you're tightening this" copy */
  requestedValues: Record<string, unknown>;
  defaultOpen?: boolean;
}) {
  const specs = capability.constraints.filter((spec) =>
    spec.actions.some((action) => activeActions.includes(action)),
  );

  const set = (key: string, value: unknown) => {
    const next = { ...values };
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  };

  // Binding three providers expands to three full limit panels, which
  // buries the rest of the decision. Collapsed by default, but the
  // summary line always states the ceilings in force — the owner should
  // never have to open a panel to learn what they're about to approve.
  const summary = specs
    .map((spec) => summarizeConstraint(spec, values[spec.key], requestedValues[spec.key]))
    .filter(Boolean) as string[];

  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-slate-200 dark:border-slate-800 open:bg-slate-50/50 dark:open:bg-slate-800/20"
    >
      <summary className="flex items-center gap-2.5 px-4 py-3 cursor-pointer select-none list-none">
        <span className="w-7 h-7 shrink-0 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center">
          <ResourceTypeIcon
            resourceType={capability.resourceType}
            className="w-4 h-4"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {capability.name}
            <span className="ml-2 font-mono font-normal text-[11px] text-slate-400">
              {capability.resourceId}
            </span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {activeActions.length} operation
            {activeActions.length === 1 ? "" : "s"}
            {summary.length > 0 && ` · ${summary.join(" · ")}`}
          </p>
        </div>
        <svg
          className="w-4 h-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </summary>

      {specs.length === 0 ? (
        <p className="px-4 pb-4 field-hint">
          This service exposes no adjustable limits for the operations you
          granted — budgets and expiry below still apply.
        </p>
      ) : (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-200 dark:border-slate-800 mt-1">
          {specs.map((spec) => (
            <ConstraintControl
              key={spec.key}
              spec={spec}
              value={values[spec.key]}
              requested={requestedValues[spec.key]}
              pricing={capability.pricing}
              onChange={(value) => set(spec.key, value)}
            />
          ))}
        </div>
      )}
    </details>
  );
}

/** One short phrase per constraint, for the collapsed summary line. */
function summarizeConstraint(
  spec: ConstraintSpec,
  value: unknown,
  requested: unknown,
): string | null {
  switch (spec.control) {
    case "models": {
      const catalogue = Array.isArray(requested)
        ? (requested as string[])
        : (spec.options ?? []);
      if (catalogue.length === 0) return null;
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return selected.length === 0
        ? `all ${catalogue.length} models`
        : `${selected.length}/${catalogue.length} models`;
    }
    case "number": {
      const effective =
        typeof value === "number"
          ? value
          : typeof requested === "number"
            ? requested
            : spec.fallback;
      if (effective === undefined) return null;
      return `${effective.toLocaleString()} ${spec.label.toLowerCase()}`;
    }
    case "boolean":
      // Only the restricted state is worth a word.
      return value === false ? `${spec.label.toLowerCase()} off` : null;
    case "domains":
    case "values": {
      const list = Array.isArray(value)
        ? (value as string[])
        : Array.isArray(requested)
          ? (requested as string[])
          : [];
      return list.length > 0 ? `${list.length} allowed` : null;
    }
  }
}

function ConstraintControl({
  spec,
  value,
  requested,
  pricing,
  onChange,
}: {
  spec: ConstraintSpec;
  value: unknown;
  requested: unknown;
  pricing?: ResourceCapabilities["pricing"];
  onChange: (value: unknown) => void;
}) {
  // Booleans render as a switch: ON is the permissive state, and only
  // the OFF state is ever written (that's what the engine tests for).
  if (spec.control === "boolean") {
    return (
      <Switch
        checked={value !== false}
        onChange={(on) => onChange(on ? undefined : false)}
        label={spec.label}
        description={spec.hint}
      />
    );
  }

  if (spec.control === "models") {
    // The app may already have narrowed the catalogue; never offer more
    // than it asked for, or the owner would be widening by accident.
    const catalogue = Array.isArray(requested)
      ? (requested as string[])
      : (spec.options ?? []);
    const selected = Array.isArray(value) ? (value as string[]) : [];
    if (catalogue.length === 0) {
      return (
        <Labelled spec={spec}>
          <p className="field-hint">
            This connector publishes no model catalogue — any model the
            provider accepts will pass through.
          </p>
        </Labelled>
      );
    }
    return (
      <Labelled
        spec={spec}
        aside={
          selected.length === 0
            ? `all ${catalogue.length}`
            : `${selected.length} of ${catalogue.length}`
        }
      >
        <PillSelect
          options={catalogue}
          selected={selected}
          onChange={(next) => onChange(next)}
        />
        {pricing && <PriceHint models={selected.length ? selected : catalogue} pricing={pricing} />}
      </Labelled>
    );
  }

  if (spec.control === "number") {
    const current =
      typeof value === "number" ? String(value) : value ? String(value) : "";
    // Two different "leave it alone" values, and they must not be
    // confused: what the app asked for, or — where it asked for
    // nothing, and on the template screen where no app is in the room
    // yet — the engine's own default.
    const asked = typeof requested === "number" ? requested : undefined;
    const effective = asked ?? spec.fallback;
    return (
      <Labelled spec={spec}>
        <div className="max-w-[14rem]">
          <NumberField
            value={current}
            onChange={(next) => onChange(next === "" ? undefined : Number(next))}
            placeholder={
              effective !== undefined
                ? `${effective.toLocaleString()} ${
                    asked !== undefined ? "(as asked)" : "(default)"
                  }`
                : "no limit"
            }
          />
        </div>
      </Labelled>
    );
  }

  // domains / free-string allowlists
  const list = Array.isArray(value) ? (value as string[]) : [];
  return (
    <Labelled spec={spec}>
      <TagInput
        values={list}
        onChange={(next) => onChange(next)}
        placeholder={
          spec.control === "domains" ? "example.com" : "add a value…"
        }
        validate={
          spec.control === "domains"
            ? (entry) =>
                /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(entry)
                  ? null
                  : `"${entry}" is not a domain`
            : undefined
        }
      />
    </Labelled>
  );
}

function Labelled({
  spec,
  aside,
  children,
}: {
  spec: ConstraintSpec;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="field-label">{spec.label}</span>
        {aside && <span className="text-[11px] text-slate-400">{aside}</span>}
      </div>
      {spec.hint && <p className="field-hint">{spec.hint}</p>}
      {children}
    </div>
  );
}

/** Cheapest → priciest output rate across the selected models. */
function PriceHint({
  models,
  pricing,
}: {
  models: string[];
  pricing: NonNullable<ResourceCapabilities["pricing"]>;
}) {
  const rates = models
    .map((model) => pricing[model]?.outputPerMTok)
    .filter((rate): rate is number => typeof rate === "number");
  if (rates.length === 0) return null;
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  return (
    <p className="field-hint">
      Output cost{" "}
      {min === max
        ? `$${max.toFixed(2)}`
        : `$${min.toFixed(2)}–$${max.toFixed(2)}`}{" "}
      per million tokens. Dropping the priciest model lowers your worst case.
    </p>
  );
}
