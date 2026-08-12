import { z } from "zod";
import {
  DURATION_PRESETS,
  type DurationPresetId,
} from "@/shared";

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

/**
 * App-supplied URLs are rendered as links (homepage), fetched (iconUrl)
 * or NAVIGATED TO after approval (redirectUri) — so the scheme must be
 * pinned to http(s). Plain z.string().url() accepts javascript: and
 * data:, which turns `window.location.href = redirectUri` into XSS on
 * the approval screen.
 */
const HttpUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === "https:" || protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "Only http(s) URLs are allowed" },
  );

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
  /** Spend ceilings in USD, enforced from connector pricing estimates */
  dailyCostUsd: z.number().positive().optional(),
  monthlyCostUsd: z.number().positive().optional(),
});

/**
 * An access option: a named bundle of the document's requests the app
 * proposes as one choice (Google-consent style — "Basic" vs "Full").
 * `requests` holds indexes into the top-level requests array; budget and
 * duration, when present, override the document-level values for that
 * option.
 *
 * OPTIONAL, and only ever a narrowing. `requests[]` is already the
 * app's own statement of what it needs, so that is what the owner is
 * asked to approve; options exist for apps that genuinely have tiers
 * ("read-only" vs "full"), and picking one simply drops the requests
 * outside it. An app with a single shape ships no options at all.
 */
export const GrantOptionSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  recommended: z.boolean().optional(),
  requests: z.array(z.number().int().nonnegative()).min(1),
  budget: GrantBudgetSchema.optional(),
  duration: DurationStringSchema.optional(),
});

export const GrantDocumentSchema = z
  .object({
    specVersion: z.string(),
    app: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      homepage: HttpUrlSchema.optional(),
      iconUrl: HttpUrlSchema.optional(),
    }),
    runtime: z.enum(["server", "serverless", "cli", "browser"]),
    auth: z.enum(["bearer", "pop"]),
    publicKey: z.string().min(40).nullable().optional(),
    requests: z.array(GrantRequestSchema).min(1),
    options: z.array(GrantOptionSchema).min(1).max(5).optional(),
    duration: DurationStringSchema,
    renewal: z.object({ period: DurationStringSchema }).optional(),
    budget: GrantBudgetSchema.optional(),
    redirectUri: HttpUrlSchema.optional(),
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
    {
      const seen = new Set<string>();
      (doc.options ?? []).forEach((option, i) => {
        if (seen.has(option.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["options", i, "id"],
            message: `Duplicate option id "${option.id}"`,
          });
        }
        seen.add(option.id);
        for (const index of option.requests) {
          if (index >= doc.requests.length) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["options", i, "requests"],
              message: `Option "${option.id}" references request index ${index}, but the document only has ${doc.requests.length} request(s)`,
            });
          }
        }
      });
    }
  });

export type GrantDocument = z.infer<typeof GrantDocumentSchema>;
export type GrantRequest = z.infer<typeof GrantRequestSchema>;
export type GrantOption = z.infer<typeof GrantOptionSchema>;

/**
 * The credential type a grant will actually use.
 *
 * This is the app's property, not the owner's preference: signing keys
 * (PoP) work only if the app both asked for them AND shipped a public
 * key to verify its signatures against. Everything else is a static
 * bearer token. The approval screen states the outcome; it doesn't
 * offer a choice, because there isn't one to make.
 */
export function effectiveAuth(document: {
  auth?: string | null;
  publicKey?: string | null;
}): "bearer" | "pop" {
  return document.auth === "pop" && !!document.publicKey ? "pop" : "bearer";
}

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
  /**
   * The app-proposed access option the owner accepted, when the app
   * offered any. Absent = approve the document's requests as written,
   * which is the normal case.
   */
  optionId: z.string().max(40).optional(),
  /** Wildcard bindings: request index → concrete resource ids */
  bindings: z.record(z.array(ResourceRefSchema)).optional(),
  /**
   * Per-request action allowlist: request index → the subset of that
   * request's `actions` the owner granted. An omitted index grants every
   * action the request asked for; an EMPTY array drops the request
   * entirely. Owners tighten, never widen — approveGrant() rejects any
   * action the request did not ask for.
   */
  actions: z.record(z.array(z.string().min(1))).optional(),
  /**
   * NOT an owner decision. Which credential an app can hold is a
   * property of the app: signing keys require it to have shipped a
   * public key and to sign every request, and no owner preference can
   * conjure that. The server derives the effective auth from the
   * document (see effectiveAuth()); this field is accepted only so
   * older clients keep parsing, and is ignored when it disagrees.
   *
   * @deprecated derived from the grant document
   */
  auth: z.enum(["bearer", "pop"]).optional(),
  /** null = forever */
  durationMs: z.number().int().positive().nullable(),
  renewal: z
    .object({ periodDays: z.number().int().positive() })
    .nullable()
    .optional(),
  budget: GrantBudgetSchema.optional(),
  /**
   * Per-resource constraint overrides applied OVER the request's own
   * constraints (keyed by concrete resource id, e.g. "llm:groq"). The
   * approval route sanitizes these against what the bound connector can
   * actually enforce before they reach here.
   */
  constraints: z.record(z.record(z.unknown())).optional(),
  egressIps: z.string().optional(),
  allowBrowser: z.boolean().optional(),
  inactivitySuspendDays: z.number().int().min(0).optional(),
  /** Owner explicitly confirmed values looser than the app requested */
  loosenedAcknowledged: z.boolean().optional(),
});

export type GrantDecisions = z.infer<typeof GrantDecisionsSchema>;
