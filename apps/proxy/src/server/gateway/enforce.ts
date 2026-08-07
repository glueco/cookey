import {
  enforcementRules,
  type ActionSpec,
  type ConnectorDocument,
  type EnforcementRule,
  type UsageSpec,
} from "@/server/connectors/schema";
import { ErrorCode } from "@/shared";

// ============================================
// GENERIC ENFORCEMENT ENGINE (4.3)
// Declarative rules from the connector document bound to the grant
// permission's constraints. Works identically for every adapter.
//
// Behavior contract (same invariants as the schema-first pipeline):
// - body is parsed once, upstream never called on a violation
// - fail-closed: a required field missing under an active constraint
//   is a violation, never a bypass
// ============================================

export interface EnforcementViolation {
  code: string;
  message: string;
  field: string;
}

export type EnforcementOutcome =
  | { allowed: true; body: unknown; clampedFields: string[] }
  | { allowed: false; violation: EnforcementViolation };

// ---- dot-path helpers ----

function getPath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split(".");
  let current = obj as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    if (current[key] === null || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys.at(-1)!] = value;
}

/** "models/x" and "x" refer to the same model (Gemini quirk). */
function modelsEqual(a: string, b: string): boolean {
  return (
    a === b ||
    a.replace(/^models\//, "") === b.replace(/^models\//, "")
  );
}

function extractEmailDomain(value: string): string {
  // Supports both "a@b.com" and "Name <a@b.com>"
  const email = /<([^>]+)>/.exec(value)?.[1] ?? value;
  return email.split("@").pop()?.trim().toLowerCase() ?? "";
}

// ---- rule evaluation ----

function evaluateRule(
  field: string,
  rule: EnforcementRule,
  constraints: Record<string, unknown>,
  connector: ConnectorDocument,
  body: unknown,
  state: { clampedFields: string[] },
): EnforcementViolation | null {
  const constraintValue = constraints[rule.constraint];
  const fieldValue = getPath(body, field);

  switch (rule.rule) {
    case "allowedValues": {
      // Missing constraint: for allowedModels the connector's model
      // catalog applies; otherwise unrestricted.
      let allowed: string[] | null = Array.isArray(constraintValue)
        ? (constraintValue as string[])
        : null;
      if (!allowed && rule.constraint === "allowedModels") {
        allowed = connector.models?.length ? connector.models : null;
      }
      if (!allowed || allowed.length === 0) return null;

      if (typeof fieldValue !== "string") {
        // Fail-closed: the field must be present when an allowlist is active
        return {
          code: ErrorCode.ERR_CONSTRAINT_VIOLATION,
          message: `'${field}' must be specified (allowlist active)`,
          field,
        };
      }

      const isModelList = rule.constraint === "allowedModels";
      const match = allowed.some((candidate) =>
        isModelList ? modelsEqual(candidate, fieldValue) : candidate === fieldValue,
      );
      if (!match) {
        return {
          code: isModelList
            ? ErrorCode.ERR_MODEL_NOT_ALLOWED
            : ErrorCode.ERR_CONSTRAINT_VIOLATION,
          message: `'${fieldValue}' is not allowed for '${field}'. Allowed: ${allowed.join(", ")}`,
          field,
        };
      }
      return null;
    }

    case "clampMax": {
      // Silently caps; never errors. Cap = constraint value, else rule default.
      // Clamping is surfaced via the x-cookey-clamped response header (4.3).
      const cap =
        typeof constraintValue === "number" ? constraintValue : rule.default;
      if (cap === undefined) return null;
      if (typeof fieldValue === "number") {
        if (fieldValue > cap) {
          setPath(body, field, cap);
          state.clampedFields.push(field);
        }
      } else {
        setPath(body, field, cap);
      }
      return null;
    }

    case "allowFlag": {
      if (constraintValue !== false) return null;
      if (fieldValue === true) {
        return {
          code: ErrorCode.ERR_CONSTRAINT_VIOLATION,
          message: `'${field}' is not allowed for this grant`,
          field,
        };
      }
      return null;
    }

    case "maxItems": {
      // Evaluated at the group level in applyEnforcement: fields sharing
      // one constraint key (e.g. to/cc/bcc → maxRecipients) are capped on
      // their COMBINED count, matching the owner-facing meaning.
      return null;
    }

    case "domainAllowlist": {
      if (!Array.isArray(constraintValue) || constraintValue.length === 0) {
        return null;
      }
      const allowed = (constraintValue as string[]).map((d) => d.toLowerCase());
      const values = Array.isArray(fieldValue)
        ? fieldValue
        : fieldValue !== undefined && fieldValue !== null
          ? [fieldValue]
          : [];
      if (values.length === 0) {
        return {
          code: ErrorCode.ERR_CONSTRAINT_VIOLATION,
          message: `'${field}' must be specified (domain allowlist active)`,
          field,
        };
      }
      for (const value of values) {
        if (typeof value !== "string") continue;
        const domain = extractEmailDomain(value);
        if (!allowed.includes(domain)) {
          return {
            code: ErrorCode.ERR_CONSTRAINT_VIOLATION,
            message: `Domain '${domain}' in '${field}' is not allowed. Allowed: ${allowed.join(", ")}`,
            field,
          };
        }
      }
      return null;
    }

    case "forbidField": {
      if (constraintValue !== false) return null;
      const present =
        fieldValue !== undefined &&
        fieldValue !== null &&
        fieldValue !== false &&
        !(Array.isArray(fieldValue) && fieldValue.length === 0);
      if (present) {
        return {
          code: ErrorCode.ERR_CONSTRAINT_VIOLATION,
          message: `'${field}' is not allowed for this grant`,
          field,
        };
      }
      return null;
    }
  }
}

/**
 * Apply an action's enforcement map to a parsed request body.
 * Mutates the body for clampMax; returns the (possibly shaped) body.
 */
export function applyEnforcement(
  action: ActionSpec,
  connector: ConnectorDocument,
  constraints: Record<string, unknown> | null,
  body: unknown,
): EnforcementOutcome {
  const enforceMap = action.enforce ?? {};
  const entries = Object.entries(enforceMap);
  if (entries.length === 0) return { allowed: true, body, clampedFields: [] };

  // Enforcement over a non-object body cannot be trusted — fail closed
  // (unparseable JSON is rejected earlier; this catches arrays/scalars)
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {
      allowed: false,
      violation: {
        code: ErrorCode.ERR_INVALID_REQUEST,
        message: "Request body must be a JSON object for this action",
        field: "",
      },
    };
  }

  const effectiveConstraints = constraints ?? {};
  const state = { clampedFields: [] as string[] };

  for (const [field, entry] of entries) {
    for (const rule of enforcementRules(entry)) {
      const violation = evaluateRule(
        field,
        rule,
        effectiveConstraints,
        connector,
        body,
        state,
      );
      if (violation) return { allowed: false, violation };
    }
  }

  // maxItems: fields sharing a constraint key are capped on their
  // combined count (to + cc + bcc ≤ maxRecipients), not per-field.
  const maxItemsGroups = new Map<string, { fields: string[]; count: number }>();
  for (const [field, entry] of entries) {
    for (const rule of enforcementRules(entry)) {
      if (rule.rule !== "maxItems") continue;
      const fieldValue = getPath(body, field);
      if (fieldValue === undefined || fieldValue === null) continue;
      const count = Array.isArray(fieldValue) ? fieldValue.length : 1;
      const group = maxItemsGroups.get(rule.constraint) ?? {
        fields: [],
        count: 0,
      };
      group.fields.push(field);
      group.count += count;
      maxItemsGroups.set(rule.constraint, group);
    }
  }
  for (const [constraintKey, group] of maxItemsGroups) {
    const cap = effectiveConstraints[constraintKey];
    if (typeof cap !== "number") continue;
    if (group.count > cap) {
      return {
        allowed: false,
        violation: {
          code: ErrorCode.ERR_CONSTRAINT_VIOLATION,
          message: `${group.fields.map((f) => `'${f}'`).join(" + ")} total ${group.count} entries; limit is ${cap}`,
          field: group.fields[0],
        },
      };
    }
  }

  return { allowed: true, body, clampedFields: state.clampedFields };
}

// ============================================
// USAGE EXTRACTION (response-field paths, replaces extractUsage())
// ============================================

export interface ExtractedUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
}

export function extractUsage(
  usage: UsageSpec | undefined,
  response: unknown,
): ExtractedUsage {
  if (!usage) return {};
  const num = (path?: string) => {
    if (!path) return undefined;
    const value = getPath(response, path);
    return typeof value === "number" ? value : undefined;
  };
  const str = (path?: string) => {
    if (!path) return undefined;
    const value = getPath(response, path);
    return typeof value === "string" ? value : undefined;
  };
  return {
    inputTokens: num(usage.inputTokens),
    outputTokens: num(usage.outputTokens),
    totalTokens: num(usage.totalTokens),
    model: str(usage.model),
  };
}

// ============================================
// ERROR MAPPING (connector errorMap, replaces mapError())
// ============================================

export interface MappedUpstreamError {
  status: number;
  code: string;
  message: string;
}

/**
 * Map an upstream error via the connector's errorMap (status- and
 * code-keyed). Never leaks credential echoes: any occurrence of the
 * resolved secret is redacted from the returned message.
 */
export function mapUpstreamError(
  connector: ConnectorDocument,
  upstreamStatus: number,
  bodyText: string,
  secret: string,
): MappedUpstreamError {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    // Non-JSON error bodies fall through to the raw text
  }

  const providerCode = connector.errorCodePath
    ? getPath(parsed, connector.errorCodePath)
    : undefined;

  const errorMap = connector.errorMap ?? {};
  const mappedCode =
    (typeof providerCode === "string" && errorMap[providerCode]) ||
    errorMap[String(upstreamStatus)] ||
    "ERR_UPSTREAM_ERROR";

  // Prefer a human message from common provider error shapes
  const message =
    (getPath(parsed, "error.message") as string | undefined) ??
    (getPath(parsed, "message") as string | undefined) ??
    bodyText.slice(0, 500);

  return {
    status: upstreamStatus,
    code: mappedCode,
    message: redactSecret(message, secret),
  };
}

/** Remove any occurrence of the secret (and its obvious prefixes) from text. */
export function redactSecret(text: string, secret: string): string {
  if (!secret || secret.length < 8) return text;
  let redacted = text.split(secret).join("[REDACTED]");
  // Partial echoes: some providers truncate the key in messages
  const head = secret.slice(0, 12);
  if (head.length >= 8) {
    redacted = redacted
      .split(head)
      .join("[REDACTED]");
  }
  return redacted;
}
