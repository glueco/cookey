import { z } from "zod";
import type { Adapter, AdapterContext, BuiltRequest } from "./types";
import type { ActionSpec } from "@/server/connectors/schema";
import { applyAuth } from "./openai-compatible";

// ============================================
// mail-send ADAPTER
// JSON POST send-email shape. Enforcement (from/to domains, recipient
// counts, html/attachments flags) runs in the generic engine; this
// adapter only normalizes recipients and forwards.
// ============================================

const configSchema = z.object({
  baseUrl: z.string().url(),
  auth: z
    .object({
      type: z.enum(["bearer", "header", "query"]),
      name: z.string().optional(),
    })
    .default({ type: "bearer" }),
});

interface MailBody {
  from?: unknown;
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  reply_to?: unknown;
  [key: string]: unknown;
}

function normalizeToArray(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value : [value];
}

export const mailSendAdapter: Adapter = {
  id: "mail-send",
  configSchema,

  buildRequest(action: ActionSpec, input: unknown, ctx: AdapterContext) {
    const config = ctx.config as unknown as z.infer<typeof configSchema>;
    const body = { ...(input as MailBody) };

    // Normalize recipient-ish fields to arrays (Resend accepts both, but
    // arrays keep the wire shape deterministic)
    for (const field of ["to", "cc", "bcc", "reply_to"] as const) {
      const normalized = normalizeToArray(body[field]);
      if (normalized === undefined || (normalized as unknown[]).length === 0) {
        delete body[field];
      } else {
        body[field] = normalized;
      }
    }

    const built: BuiltRequest = {
      url: `${config.baseUrl.replace(/\/$/, "")}${action.path}`,
      method: action.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };

    return applyAuth(built, config, ctx.secret);
  },

  async parseResponse(_action, response) {
    return {
      response: await response.json(),
      contentType: "application/json",
    };
  },
};
