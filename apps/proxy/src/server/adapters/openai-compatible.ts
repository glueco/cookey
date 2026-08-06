import { z } from "zod";
import type { Adapter, AdapterContext, BuiltRequest } from "./types";
import type { ActionSpec } from "@/server/connectors/schema";

// ============================================
// openai-compatible ADAPTER
// Bearer/header auth, JSON to baseUrl + path, body passthrough, SSE
// stream passthrough. Covers Groq, OpenAI, and the entire
// OpenAI-compatible long tail (OpenRouter, DeepSeek, Together, Mistral,
// Ollama, vLLM, …) as pure-data connectors.
// ============================================

const configSchema = z.object({
  baseUrl: z.string().url(),
  auth: z
    .object({
      type: z.enum(["bearer", "header", "query"]),
      name: z.string().optional(),
    })
    .default({ type: "bearer" }),
  /**
   * Extra request headers. Values support "{credential:<field>}"
   * placeholders resolved from credential fields (e.g. the OpenAI
   * organization header); entries whose credential is unset are dropped.
   */
  extraHeaders: z.record(z.string()).optional(),
});

export type OpenAiCompatibleConfig = z.infer<typeof configSchema>;

export function resolveHeaderTemplate(
  template: string,
  credentials: Record<string, string>,
): string | null {
  let missing = false;
  const value = template.replace(/\{credential:([a-zA-Z0-9_]+)\}/g, (_, name) => {
    const resolved = credentials[name];
    if (!resolved) {
      missing = true;
      return "";
    }
    return resolved;
  });
  return missing ? null : value;
}

export function applyAuth(
  built: BuiltRequest,
  config: { auth: { type: string; name?: string } },
  secret: string,
): BuiltRequest {
  switch (config.auth.type) {
    case "header":
      built.headers[config.auth.name ?? "x-api-key"] = secret;
      break;
    case "query": {
      const url = new URL(built.url);
      url.searchParams.set(config.auth.name ?? "key", secret);
      built.url = url.toString();
      break;
    }
    case "bearer":
    default:
      built.headers["Authorization"] = `Bearer ${secret}`;
  }
  return built;
}

export const openAiCompatibleAdapter: Adapter = {
  id: "openai-compatible",
  configSchema,

  buildRequest(action: ActionSpec, input: unknown, ctx: AdapterContext) {
    const config = ctx.config as unknown as OpenAiCompatibleConfig;
    const baseUrl = config.baseUrl.replace(/\/$/, "");

    const built: BuiltRequest = {
      url: `${baseUrl}${action.path}`,
      method: action.method,
      headers: {},
    };

    if (action.method !== "GET" && input !== undefined) {
      built.headers["Content-Type"] = "application/json";
      built.body = JSON.stringify(input);
    }

    for (const [name, template] of Object.entries(config.extraHeaders ?? {})) {
      const value = resolveHeaderTemplate(template, ctx.credentials);
      if (value !== null) built.headers[name] = value;
    }

    return applyAuth(built, config, ctx.secret);
  },

  async parseResponse(_action, response, opts) {
    if (opts.stream) {
      return {
        stream: response.body!,
        contentType: "text/event-stream",
      };
    }
    return {
      response: await response.json(),
      contentType: "application/json",
    };
  },
};
