// ============================================
// PERMISSION TEMPLATES
//
// A template is a ready-to-use permissions package: the services and
// operations it covers, the ceilings each service runs under, and the
// duration/budget/hardening answers that go with them. One saved
// decision, reusable across apps.
//
// It is NOT a competing idea to "what the app asked for". An app's
// grant document states what it wants; a template states what you're
// willing to hand out. Applying one on the approval screen INTERSECTS
// the two — a template can only ever narrow a request, never add an
// operation the app didn't ask for, and never a service it didn't name.
// That's why nothing here is mandatory: with no template applied, the
// app's own request stands as the answer.
//
// Shared by the template editor and the approval screen, so the two
// can't drift on what a template means.
// ============================================

export const DAY_MS = 24 * 60 * 60 * 1000;

export const DURATION_PRESETS: Array<{ label: string; ms: number | null }> = [
  { label: "24h", ms: DAY_MS },
  { label: "7d", ms: 7 * DAY_MS },
  { label: "30d", ms: 30 * DAY_MS },
  { label: "90d", ms: 90 * DAY_MS },
  { label: "1y", ms: 365 * DAY_MS },
  { label: "Forever", ms: null },
];

export const BUDGET_FIELDS = [
  ["dailyRequests", "Requests / day"],
  ["dailyTokens", "Tokens / day"],
  ["dailyCostUsd", "Spend / day ($)"],
  ["monthlyRequests", "Requests / month"],
  ["monthlyTokens", "Tokens / month"],
  ["monthlyCostUsd", "Spend / month ($)"],
] as const;

export type BudgetKey = (typeof BUDGET_FIELDS)[number][0];

/** Keys that hold dollars — parsed as decimals, everything else as ints. */
export const COST_BUDGET_KEYS: readonly BudgetKey[] = [
  "dailyCostUsd",
  "monthlyCostUsd",
];

/** Parse one budget field's input string by its key's type. */
export function parseBudgetValue(key: BudgetKey, value: string): number {
  return COST_BUDGET_KEYS.includes(key)
    ? parseFloat(value)
    : parseInt(value, 10);
}

/** One service in the package, with the verbs and ceilings it carries. */
export interface TemplateService {
  /** Concrete resource id — "llm:groq", never a wildcard */
  resourceId: string;
  /** Operation ids allowed on it. Empty = the service is not included. */
  actions: string[];
  /** Per-service limits, same shape as a permission's constraints */
  constraints?: Record<string, unknown>;
}

export interface TemplateValues {
  /**
   * The permissions package. Absent (not empty) means the template has
   * nothing to say about scope and only carries the settings below —
   * which is what every template did before packages existed.
   */
  services?: TemplateService[];
  /** null = forever */
  durationMs?: number | null;
  renewal?: { periodDays: number } | null;
  budget?: Partial<Record<BudgetKey, number>>;
  inactivitySuspendDays?: number;
  allowBrowser?: boolean;
}

export interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  values: TemplateValues;
}

/**
 * Read stored values defensively.
 *
 * Templates are free-form JSON on the row, and older ones carry an
 * `auth` key from when the owner picked the credential type. That is
 * now derived from the app's own document, so it's dropped on read —
 * silently, because there is no version of "apply my auth preference"
 * that we could honour even if we wanted to.
 */
export function normalizeTemplateValues(raw: unknown): TemplateValues {
  const source = (raw ?? {}) as Record<string, unknown>;

  const services = Array.isArray(source.services)
    ? (source.services as unknown[])
        .map((entry) => {
          const service = (entry ?? {}) as Record<string, unknown>;
          const resourceId =
            typeof service.resourceId === "string" ? service.resourceId : "";
          const actions = Array.isArray(service.actions)
            ? (service.actions as unknown[]).filter(
                (action): action is string => typeof action === "string",
              )
            : [];
          if (!resourceId || actions.length === 0) return null;
          return {
            resourceId,
            actions,
            ...(service.constraints && typeof service.constraints === "object"
              ? { constraints: service.constraints as Record<string, unknown> }
              : {}),
          } satisfies TemplateService;
        })
        .filter((service): service is TemplateService => service !== null)
    : undefined;

  const budget = (source.budget ?? {}) as Record<string, unknown>;

  return {
    ...(services && services.length > 0 ? { services } : {}),
    ...(source.durationMs !== undefined
      ? { durationMs: source.durationMs as number | null }
      : {}),
    ...(source.renewal !== undefined
      ? { renewal: source.renewal as TemplateValues["renewal"] }
      : {}),
    budget: Object.fromEntries(
      BUDGET_FIELDS.map(([key]) => [key, budget[key]]).filter(
        ([, value]) => typeof value === "number",
      ),
    ),
    ...(typeof source.inactivitySuspendDays === "number"
      ? { inactivitySuspendDays: source.inactivitySuspendDays }
      : {}),
    ...(typeof source.allowBrowser === "boolean"
      ? { allowBrowser: source.allowBrowser }
      : {}),
  };
}

export function durationLabel(ms: number | null | undefined): string {
  if (ms === undefined) return "duration unchanged";
  if (ms === null) return "never expires";
  const preset = DURATION_PRESETS.find((p) => p.ms === ms);
  if (preset) return `expires in ${preset.label}`;
  return `expires in ${Math.max(1, Math.round(ms / DAY_MS))}d`;
}

/** Plain-language chips describing what applying this template does. */
export function summarizeTemplate(values: TemplateValues): string[] {
  const chips: string[] = [];

  const services = values.services ?? [];
  if (services.length > 0) {
    const operations = services.reduce(
      (sum, service) => sum + service.actions.length,
      0,
    );
    chips.push(
      `${services.length} service${services.length === 1 ? "" : "s"}`,
      `${operations} operation${operations === 1 ? "" : "s"}`,
    );
    const limited = services.filter(
      (service) => Object.keys(service.constraints ?? {}).length > 0,
    ).length;
    if (limited > 0) chips.push(`${limited} with limits`);
  } else {
    chips.push("settings only");
  }

  chips.push(durationLabel(values.durationMs));
  if (values.renewal) chips.push(`renews every ${values.renewal.periodDays}d`);

  const budget = values.budget ?? {};
  const caps = BUDGET_FIELDS.filter(([key]) => budget[key] !== undefined).map(
    ([key, label]) => {
      const amount = COST_BUDGET_KEYS.includes(key)
        ? `$${budget[key]!.toLocaleString()}`
        : `${budget[key]!.toLocaleString()} ${label.split(" / ")[0].toLowerCase()}`;
      return `${amount}/${label.includes("day") ? "day" : "mo"}`;
    },
  );
  chips.push(...(caps.length > 0 ? caps : ["no budget caps"]));

  if (values.inactivitySuspendDays) {
    chips.push(`idle-suspend ${values.inactivitySuspendDays}d`);
  }
  if (values.allowBrowser) chips.push("browser allowed");
  return chips;
}

// ---- applying a package to a request document --------------------------

/** The shape of one request, as far as template application cares. */
interface ScopedRequest {
  /** "llm:groq" or the wildcard form "llm:*" */
  resource: string;
  actions: string[];
}

export interface TemplateScopeResult {
  /** request index → the actions the template leaves granted */
  actions: Record<string, string[]>;
  /** request index → concrete resource ids, for wildcard requests */
  bindings: Record<string, string[]>;
  /** resourceId → limits the template carries for it */
  constraints: Record<string, Record<string, unknown>>;
  /** Requests the template dropped entirely, by name, for the report */
  dropped: string[];
  /** Operations the template removed but left the request standing */
  narrowed: number;
}

/**
 * Intersect a template's package with what an app asked for.
 *
 * The template can only subtract. For each request:
 *   - a concrete resource is kept if the template names it, and keeps
 *     only the operations present in BOTH;
 *   - a wildcard ("llm:*") binds to the template's services of that
 *     type that are also available here;
 *   - a request the template says nothing about is dropped.
 *
 * `availableResourceIds` is the set of resources this gateway can
 * actually serve — a template naming a connector that has since been
 * removed must not bind to it.
 */
export function applyTemplateScope(
  values: TemplateValues,
  requests: ScopedRequest[],
  availableResourceIds: string[],
): TemplateScopeResult | null {
  const services = values.services ?? [];
  if (services.length === 0) return null; // settings-only template

  const available = new Set(availableResourceIds);
  const byResourceId = new Map(
    services
      .filter((service) => available.has(service.resourceId))
      .map((service) => [service.resourceId, service]),
  );

  const result: TemplateScopeResult = {
    actions: {},
    bindings: {},
    constraints: {},
    dropped: [],
    narrowed: 0,
  };

  requests.forEach((request, index) => {
    const key = String(index);
    const isWildcard = request.resource.endsWith(":*");
    const matches = isWildcard
      ? [...byResourceId.values()].filter((service) =>
          service.resourceId.startsWith(`${request.resource.slice(0, -1)}`),
        )
      : [byResourceId.get(request.resource)].filter(
          (service): service is TemplateService => service !== undefined,
        );

    if (matches.length === 0) {
      result.actions[key] = [];
      if (isWildcard) result.bindings[key] = [];
      result.dropped.push(request.resource);
      return;
    }

    // Union across the matched services, then intersect with the
    // request: the owner can't hand out a verb the app never asked for.
    const offered = new Set(matches.flatMap((service) => service.actions));
    const kept = request.actions.filter((action) => offered.has(action));

    result.actions[key] = kept;
    if (isWildcard) {
      result.bindings[key] = matches.map((service) => service.resourceId);
    }
    if (kept.length === 0) {
      result.dropped.push(request.resource);
    } else if (kept.length < request.actions.length) {
      result.narrowed += request.actions.length - kept.length;
    }

    for (const service of matches) {
      if (service.constraints && Object.keys(service.constraints).length > 0) {
        result.constraints[service.resourceId] = {
          ...(result.constraints[service.resourceId] ?? {}),
          ...service.constraints,
        };
      }
    }
  });

  return result;
}
