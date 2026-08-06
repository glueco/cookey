import { z } from "zod";

// ============================================
// CONNECTOR DOCUMENT SCHEMA (specVersion 1)
// A connector is pure data: it names an adapter (built-in code) and
// supplies config. Validated at install; frozen in the DB afterwards.
// ============================================

export const CONNECTOR_DOCUMENT_MAX_BYTES = 64 * 1024;

/** Fixed enforcement rule set for specVersion 1 (4.3). */
export const ENFORCEMENT_RULES = [
  "allowedValues",
  "clampMax",
  "allowFlag",
  "maxItems",
  "domainAllowlist",
  "forbidField",
] as const;

export type EnforcementRuleName = (typeof ENFORCEMENT_RULES)[number];

const EnforcementRuleSchema = z.object({
  rule: z.enum(ENFORCEMENT_RULES),
  /** Key into the permission's constraints Json this rule binds to */
  constraint: z.string().min(1),
  /** clampMax only: applied when the body field is absent */
  default: z.number().optional(),
});

export type EnforcementRule = z.infer<typeof EnforcementRuleSchema>;

// A field may carry one rule or several (e.g. "to" needs both maxItems
// and domainAllowlist).
const EnforcementEntrySchema = z.union([
  EnforcementRuleSchema,
  z.array(EnforcementRuleSchema).min(1),
]);

const UsageSpecSchema = z.object({
  inputTokens: z.string().optional(),
  outputTokens: z.string().optional(),
  totalTokens: z.string().optional(),
  model: z.string().optional(),
});

export type UsageSpec = z.infer<typeof UsageSpecSchema>;

const ActionSpecSchema = z
  .object({
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    /** Appended to config.baseUrl by the adapter */
    path: z.string().optional(),
    /** http-passthrough only: glob allowlist the request sub-path must match */
    pathPattern: z.string().optional(),
    streaming: z.boolean().default(false),
    enforce: z.record(EnforcementEntrySchema).optional(),
    usage: UsageSpecSchema.optional(),
  })
  .refine((a) => a.path !== undefined || a.pathPattern !== undefined, {
    message: "Action needs a path (or pathPattern for http-passthrough)",
  });

export type ActionSpec = z.infer<typeof ActionSpecSchema>;

const CredentialFieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "secret", "url", "number", "boolean"]),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(true),
  default: z.unknown().optional(),
});

const PricingEntrySchema = z.object({
  inputPerMTok: z.number().nonnegative(),
  outputPerMTok: z.number().nonnegative(),
});

const BARE_HOSTNAME_REGEX =
  /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))*$/;

export const ConnectorDocumentSchema = z
  .object({
    specVersion: z.string(),
    id: z.string().regex(/^[a-z]+:[a-z0-9-]+$/, {
      message: 'Connector id must be "<resourceType>:<provider>"',
    }),
    name: z.string().min(1).max(100),
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/, "version must be semver"),
    description: z.string().max(500).optional(),
    homepage: z.string().url().optional(),
    iconUrl: z.string().url().optional(),
    resourceType: z.string().min(1),
    adapter: z.string().min(1),
    config: z.record(z.unknown()).default({}),
    allowedHosts: z
      .array(
        z.string().regex(BARE_HOSTNAME_REGEX, {
          message: "allowedHosts entries must be bare hostnames (no scheme/port/path)",
        }),
      )
      .min(1)
      .optional(),
    actions: z.record(ActionSpecSchema).refine((a) => Object.keys(a).length > 0, {
      message: "Connector needs at least one action",
    }),
    models: z.array(z.string()).optional(),
    pricing: z.record(PricingEntrySchema).optional(),
    credentials: z.array(CredentialFieldSchema).optional(),
    errorMap: z.record(z.string()).optional(),
    errorCodePath: z.string().optional(),
  })
  .superRefine((doc, ctx) => {
    const major = doc.specVersion.split(".")[0];
    if (major !== "1") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specVersion"],
        message: `Unsupported connector specVersion "${doc.specVersion}" — this gateway speaks major version 1`,
      });
    }
    if (!doc.id.startsWith(`${doc.resourceType}:`)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resourceType"],
        message: `resourceType "${doc.resourceType}" must equal the prefix of id "${doc.id}"`,
      });
    }
  });

export type ConnectorDocument = z.infer<typeof ConnectorDocumentSchema>;

/** Normalize an enforcement entry to a rule list. */
export function enforcementRules(
  entry: EnforcementRule | EnforcementRule[],
): EnforcementRule[] {
  return Array.isArray(entry) ? entry : [entry];
}

/** Extract the hostname from config.baseUrl, if present and valid. */
export function baseUrlHost(config: Record<string, unknown>): string | null {
  if (typeof config.baseUrl !== "string") return null;
  try {
    return new URL(config.baseUrl).hostname;
  } catch {
    return null;
  }
}

export interface ConnectorValidationOk {
  valid: true;
  document: ConnectorDocument;
}
export interface ConnectorValidationError {
  valid: false;
  errors: Array<{ path: string; message: string }>;
}

/**
 * Validate a raw value as a connector document (install-time gate).
 * - enforces the 64 KB cap
 * - derives allowedHosts from config.baseUrl when omitted, and requires
 *   the baseUrl host to be present in the final list
 * Adapter existence + adapter-config validation happen in the registry
 * (they need the adapter registry, which would be a circular import here).
 */
export function validateConnectorDocument(
  raw: unknown,
): ConnectorValidationOk | ConnectorValidationError {
  const size = Buffer.byteLength(JSON.stringify(raw ?? ""), "utf8");
  if (size > CONNECTOR_DOCUMENT_MAX_BYTES) {
    return {
      valid: false,
      errors: [
        {
          path: "",
          message: `Connector document exceeds ${CONNECTOR_DOCUMENT_MAX_BYTES / 1024} KB`,
        },
      ],
    };
  }

  const parsed = ConnectorDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    };
  }

  const document = parsed.data;
  const host = baseUrlHost(document.config);

  // Derive allowedHosts from baseUrl when omitted; frozen from then on
  if (!document.allowedHosts) {
    if (!host) {
      return {
        valid: false,
        errors: [
          {
            path: "allowedHosts",
            message:
              "allowedHosts is required (it could not be derived — config.baseUrl is missing or invalid)",
          },
        ],
      };
    }
    document.allowedHosts = [host];
  } else if (host && !document.allowedHosts.includes(host)) {
    return {
      valid: false,
      errors: [
        {
          path: "allowedHosts",
          message: `config.baseUrl host "${host}" must be present in allowedHosts`,
        },
      ],
    };
  }

  return { valid: true, document };
}
