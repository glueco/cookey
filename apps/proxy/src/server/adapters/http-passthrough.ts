import { z } from "zod";
import type { Adapter, AdapterContext, BuiltRequest } from "./types";
import type { ActionSpec } from "@/server/connectors/schema";
import { applyAuth } from "./openai-compatible";

// ============================================
// http-passthrough ADAPTER
// Generic REST forwarder — the escape hatch that lets the custom
// builder wrap ANY REST API without code. Injects the credential,
// restricts requests to per-action pathPattern globs, forwards body
// bytes untouched, streams responses. No body-level enforcement;
// request-count limits and quotas still apply.
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

/**
 * Match a request sub-path against a glob pattern.
 * `*` matches within a segment, `**` matches across segments.
 */
export function pathMatchesPattern(path: string, pattern: string): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const escaped = pattern
    .split(/(\*\*|\*)/)
    .map((part) => {
      if (part === "**") return ".*";
      if (part === "*") return "[^/]*";
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${escaped}$`).test(normalized);
}

export const httpPassthroughAdapter: Adapter = {
  id: "http-passthrough",
  configSchema,

  buildRequest(action: ActionSpec, input: unknown, ctx: AdapterContext) {
    const config = ctx.config as unknown as z.infer<typeof configSchema>;
    const subPath = ctx.subPath ?? action.path ?? "";

    const built: BuiltRequest = {
      url: `${config.baseUrl.replace(/\/$/, "")}${subPath.startsWith("/") ? subPath : `/${subPath}`}`,
      method: action.method,
      headers: {},
    };

    // Forward body bytes untouched
    if (input !== undefined && action.method !== "GET") {
      if (input instanceof Uint8Array) {
        built.body = input as unknown as BodyInit;
      } else if (typeof input === "string") {
        built.body = input;
        built.headers["Content-Type"] = "application/json";
      } else {
        built.body = JSON.stringify(input);
        built.headers["Content-Type"] = "application/json";
      }
    }

    return applyAuth(built, config, ctx.secret);
  },

  async parseResponse(_action, response, opts) {
    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";

    if (opts.stream || contentType.includes("text/event-stream")) {
      return {
        stream: response.body ?? new ReadableStream(),
        contentType,
      };
    }

    if (contentType.includes("application/json")) {
      return { response: await response.json(), contentType };
    }

    // Non-JSON payloads stream through untouched
    return {
      stream: response.body ?? new ReadableStream(),
      contentType,
    };
  },
};
