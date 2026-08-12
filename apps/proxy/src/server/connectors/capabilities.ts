import {
  enforcementRules,
  type ConnectorDocument,
} from "./schema";

// ============================================
// CONNECTOR CAPABILITIES (approval-screen metadata)
//
// The gateway already knows exactly what it can enforce per connector:
// every action's `enforce` map names the constraint keys the engine
// reads. This derives an owner-facing control descriptor from that map
// so the approval screen can offer REAL limits instead of a fixed,
// hand-written list that drifts from what the engine honours.
//
// Anything the engine can't enforce never reaches the screen, so the
// owner is never shown a switch that quietly does nothing.
// ============================================

export type ConstraintControl =
  | "models" // pick from the connector's model catalogue
  | "number" // numeric ceiling
  | "boolean" // capability on/off (stored as `false` when denied)
  | "domains" // email-domain allowlist
  | "values"; // free-string allowlist

export interface ConstraintSpec {
  /** Key written into the permission's constraints JSON */
  key: string;
  control: ConstraintControl;
  label: string;
  hint?: string;
  /** models/values: the catalogue to choose from (may be empty) */
  options?: string[];
  /** number: the engine's fallback cap when the field is absent */
  fallback?: number;
  /** Action ids this constraint actually affects */
  actions: string[];
}

export interface ActionSpecSummary {
  id: string;
  label: string;
  description?: string;
  streaming: boolean;
  /** Actions that change state elsewhere deserve louder treatment */
  mutating: boolean;
}

export interface ResourceCapabilities {
  resourceId: string;
  name: string;
  resourceType: string;
  description?: string;
  iconUrl?: string;
  models: string[];
  pricing?: Record<string, { inputPerMTok: number; outputPerMTok: number }>;
  actions: ActionSpecSummary[];
  constraints: ConstraintSpec[];
  /** Credentials are stored for this resource (it can actually serve) */
  configured: boolean;
}

// ---- owner-facing copy -------------------------------------------------

/**
 * Plain-language names for the constraint keys the built-in connectors
 * use. Unknown keys still render (derived from the enforce map) with a
 * de-camel-cased label, so third-party connectors are supported without
 * a code change here.
 */
const CONSTRAINT_COPY: Record<string, { label: string; hint?: string }> = {
  allowedModels: {
    label: "Models",
    hint: "Only the selected models may be requested. Cheaper models mean a lower worst-case bill.",
  },
  maxOutputTokens: {
    label: "Max reply length",
    hint: "Longer replies are silently trimmed to this many tokens rather than rejected.",
  },
  allowStreaming: {
    label: "Streaming responses",
    hint: "Token-by-token replies. Harmless, but streamed usage is metered after the fact.",
  },
  allowTools: {
    label: "Tool / function calling",
    hint: "Lets the model ask the app to run functions. Turn off for plain chat use.",
  },
  maxRecipients: {
    label: "Recipients per email",
    hint: "Counts To + Cc + Bcc together — the practical brake on a compromised app spamming.",
  },
  allowedFromDomains: {
    label: "Allowed From domains",
    hint: "The app may only send as an address at these domains.",
  },
  allowedToDomains: {
    label: "Allowed To domains",
    hint: "The app may only send to addresses at these domains. Leave empty to allow any.",
  },
  allowAttachments: {
    label: "Attachments",
    hint: "Attachments can carry data out of your systems.",
  },
  allowHtml: { label: "HTML email" },
};

const ACTION_COPY: Record<
  string,
  { label: string; description?: string; mutating?: boolean }
> = {
  "chat.completions": {
    label: "Chat with models",
    description: "Send prompts and receive completions.",
  },
  "models.list": {
    label: "List available models",
    description: "Read-only catalogue lookup. Costs nothing.",
  },
  "emails.send": {
    label: "Send email",
    description: "Deliver mail from your account.",
    mutating: true,
  },
  send: {
    label: "Send email",
    description: "Deliver mail from your account.",
    mutating: true,
  },
  request: {
    label: "Make API requests",
    description: "Proxy arbitrary calls to the upstream API.",
    mutating: true,
  },
};

/** "allowedFromDomains" → "Allowed from domains" */
function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function describeActionId(id: string): ActionSpecSummary {
  const copy = ACTION_COPY[id];
  return {
    id,
    label: copy?.label ?? id,
    description: copy?.description,
    streaming: false,
    mutating: copy?.mutating ?? false,
  };
}

// ---- derivation --------------------------------------------------------

const RULE_CONTROL: Record<string, ConstraintControl> = {
  allowedValues: "values",
  clampMax: "number",
  allowFlag: "boolean",
  forbidField: "boolean",
  maxItems: "number",
  domainAllowlist: "domains",
};

/**
 * Walk a connector's actions and collapse its enforce maps into one
 * constraint list. A key touched by several fields (maxRecipients via
 * to/cc/bcc) collapses to a single control, because that is how the
 * engine evaluates it — on the combined count.
 */
export function deriveConstraintSpecs(
  connector: ConnectorDocument,
): ConstraintSpec[] {
  const byKey = new Map<string, ConstraintSpec>();

  for (const [actionId, action] of Object.entries(connector.actions)) {
    for (const entry of Object.values(action.enforce ?? {})) {
      for (const rule of enforcementRules(entry)) {
        const control = RULE_CONTROL[rule.rule];
        if (!control) continue;

        const existing = byKey.get(rule.constraint);
        if (existing) {
          if (!existing.actions.includes(actionId)) {
            existing.actions.push(actionId);
          }
          if (existing.fallback === undefined && rule.default !== undefined) {
            existing.fallback = rule.default;
          }
          continue;
        }

        const isModelList = rule.constraint === "allowedModels";
        const copy = CONSTRAINT_COPY[rule.constraint];
        byKey.set(rule.constraint, {
          key: rule.constraint,
          control: isModelList ? "models" : control,
          label: copy?.label ?? humanize(rule.constraint),
          hint: copy?.hint,
          ...(isModelList && { options: connector.models ?? [] }),
          ...(rule.default !== undefined && { fallback: rule.default }),
          actions: [actionId],
        });
      }
    }
  }

  return [...byKey.values()];
}

/** Owner-facing summary of one connector, ready to ship to the client. */
export function describeConnector(
  connector: ConnectorDocument,
  options: { configured: boolean; name?: string },
): ResourceCapabilities {
  return {
    resourceId: connector.id,
    name: options.name || connector.name,
    resourceType: connector.resourceType,
    description: connector.description,
    iconUrl: connector.iconUrl,
    models: connector.models ?? [],
    pricing: connector.pricing,
    actions: Object.entries(connector.actions).map(([id, action]) => ({
      ...describeActionId(id),
      streaming: action.streaming ?? false,
    })),
    constraints: deriveConstraintSpecs(connector),
    configured: options.configured,
  };
}

// ---- validation --------------------------------------------------------

/**
 * Drop owner-supplied constraint values the connector cannot enforce,
 * and coerce the rest to the shape the engine expects. Approval input
 * is trusted-but-verified: a stale browser tab must never write a key
 * that silently widens access because nothing reads it.
 */
export function sanitizeConstraints(
  specs: ConstraintSpec[],
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const bySpec = new Map(specs.map((spec) => [spec.key, spec]));
  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    const spec = bySpec.get(key);
    if (!spec) continue;

    switch (spec.control) {
      case "models":
      case "values":
      case "domains": {
        if (!Array.isArray(value)) break;
        const list = value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
        // An empty allowlist disables the rule entirely, which reads as
        // "no restriction" — store nothing rather than a false lock.
        if (list.length > 0) clean[key] = [...new Set(list)];
        break;
      }
      case "number": {
        const parsed =
          typeof value === "number" ? value : parseInt(String(value), 10);
        if (Number.isFinite(parsed) && parsed > 0) clean[key] = parsed;
        break;
      }
      case "boolean": {
        // Only `false` is meaningful: it's what the engine tests for.
        if (value === false) clean[key] = false;
        break;
      }
    }
  }

  return clean;
}
