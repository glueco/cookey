import { z } from "zod";
import {
  DURATION_PRESETS,
  type DurationPresetId,
} from "@glueco/shared";

// ============================================
// GRANT DOCUMENT SCHEMA (specVersion 1)
// The contract an app author writes. Frozen verbatim on the Grant row.
// ============================================

export const GRANT_DOCUMENT_MAX_BYTES = 32 * 1024;
const REASON_MAX_LENGTH = 300;

/**
 * Durations accept either a shared preset id ("1_month") or a compact
 * "<n><unit>" string ("30d", "12h", "4w") as used throughout the spec.
 */
export const DurationStringSchema = z
  .string()
  .refine((value) => parseDurationMs(value) !== undefined, {
    message:
      "Invalid duration. Use e.g. \"7d\", \"12h\", \"4w\", a preset id like \"1_month\", or \"forever\"",
  });

/**
 * Parse a duration string to milliseconds.
 * Returns null for "forever", undefined when unparseable.
 */
export function parseDurationMs(value: string): number | null | undefined {
  if (value === "forever") return null;

  const preset = DURATION_PRESETS.find(
    (p) => p.id === (value as DurationPresetId),
  );
  if (preset && preset.id !== "custom") return preset.durationMs;

  const match = /^(\d+)(h|d|w|m|y)$/.exec(value);
  if (!match) return undefined;
  const n = parseInt(match[1], 10);
  if (n <= 0) return undefined;
  const unitMs: Record<string, number> = {
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    m: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
  };
  return n * unitMs[match[2]];
}

/** Duration string → whole days (rounded up), null for forever. */
export function parseDurationDays(value: string): number | null {
  const ms = parseDurationMs(value);
  if (ms === null || ms === undefined) return null;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

const ResourceRefSchema = z
  .string()
  .regex(/^[a-z]+:([a-z0-9-]+|\*)$/, {
    message:
      "Invalid resource. Use \"<type>:<provider>\" (llm:groq) or the wildcard form \"<type>:*\"",
  });

export const GrantRequestSchema = z.object({
  resource: ResourceRefSchema,
  actions: z.array(z.string().min(1)).min(1),
  reason: z
    .string()
    .min(1, "Every request must explain why the access is needed")
    .max(REASON_MAX_LENGTH),
  constraints: z.record(z.unknown()).optional(),
});

export const GrantBudgetSchema = z.object({
  dailyRequests: z.number().int().positive().optional(),
  monthlyRequests: z.number().int().positive().optional(),
  dailyTokens: z.number().int().positive().optional(),
  monthlyTokens: z.number().int().positive().optional(),
});

export const GrantDocumentSchema = z
  .object({
    specVersion: z.string(),
    app: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      homepage: z.string().url().optional(),
      iconUrl: z.string().url().optional(),
    }),
    runtime: z.enum(["server", "serverless", "cli", "browser"]),
    auth: z.enum(["bearer", "pop"]),
    publicKey: z.string().min(40).nullable().optional(),
    requests: z.array(GrantRequestSchema).min(1),
    duration: DurationStringSchema,
    renewal: z.object({ period: DurationStringSchema }).optional(),
    budget: GrantBudgetSchema.optional(),
    redirectUri: z.string().url().optional(),
    /** Set on documents synthesized from pre-grant apps / legacy prepare calls */
    legacy: z.boolean().optional(),
  })
  .superRefine((doc, ctx) => {
    const major = doc.specVersion.split(".")[0];
    if (major !== "1") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specVersion"],
        message: `Unsupported grant specVersion "${doc.specVersion}" — this gateway speaks major version 1`,
      });
    }
    if (doc.auth === "pop" && !doc.publicKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publicKey"],
        message: "publicKey is required when auth is \"pop\"",
      });
    }
    if (doc.renewal && parseDurationMs(doc.renewal.period) === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["renewal", "period"],
        message: "Renewal period cannot be \"forever\"",
      });
    }
  });

export type GrantDocument = z.infer<typeof GrantDocumentSchema>;
export type GrantRequest = z.infer<typeof GrantRequestSchema>;

/**
 * Validate a raw value as a grant document, enforcing the size cap first.
 */
export function validateGrantDocument(
  raw: unknown,
):
  | { valid: true; document: GrantDocument }
  | { valid: false; errors: Array<{ path: string; message: string }> } {
  const size = Buffer.byteLength(JSON.stringify(raw ?? ""), "utf8");
  if (size > GRANT_DOCUMENT_MAX_BYTES) {
    return {
      valid: false,
      errors: [
        {
          path: "",
          message: `Grant document exceeds ${GRANT_DOCUMENT_MAX_BYTES / 1024} KB`,
        },
      ],
    };
  }

  const parsed = GrantDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    };
  }
  return { valid: true, document: parsed.data };
}

// ============================================
// APPROVAL DECISIONS SCHEMA
// What the owner chose on the approval screen; frozen alongside the document.
// ============================================

export const GrantDecisionsSchema = z.object({
  /** Wildcard bindings: request index → concrete resource ids */
  bindings: z.record(z.array(ResourceRefSchema)).optional(),
  auth: z.enum(["bearer", "pop"]),
  /** null = forever */
  durationMs: z.number().int().positive().nullable(),
  renewal: z
    .object({ periodDays: z.number().int().positive() })
    .nullable()
    .optional(),
  budget: GrantBudgetSchema.optional(),
  /** Per-resource constraint overrides applied over request constraints */
  constraints: z.record(z.record(z.unknown())).optional(),
  egressIps: z.string().optional(),
  allowBrowser: z.boolean().optional(),
  inactivitySuspendDays: z.number().int().min(0).optional(),
  /** Owner explicitly confirmed values looser than the app requested */
  loosenedAcknowledged: z.boolean().optional(),
});

export type GrantDecisions = z.infer<typeof GrantDecisionsSchema>;
