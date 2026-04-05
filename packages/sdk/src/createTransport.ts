/**
 * Simple transport creation for the Glueco Gateway SDK.
 *
 * Provides createTransport() - the simplest way to get a signed transport.
 * Requires only proxyUrl and appId. Uses GLUECO_PRIVATE_KEY from env.
 *
 * @example
 * import { createTransport } from "@glueco/sdk";
 *
 * // App has saved these from the callback
 * const transport = createTransport({
 *   proxyUrl: "https://gateway.example.com",
 *   appId: "app_abc123",
 * });
 *
 * // Use with plugins
 * import { groq } from "@glueco/plugin-llm-groq/client";
 * const client = groq(transport);
 * const response = await client.chatCompletions({...});
 */

import { sha256 } from "@noble/hashes/sha256";
import {
  buildCanonicalRequestV1,
  getPathWithQuery,
  POP_VERSION,
} from "@glueco/shared";
import {
  loadSeedFromEnv,
  signToBase64Url,
  base64UrlEncode,
  generateNonce,
} from "./keys";
import { parseGatewayError } from "./errors";
import type {
  GatewayTransport,
  GatewayRequestOptions,
  GatewayResponse,
  GatewayStreamResponse,
} from "./transport";
import { resolveFetch } from "./fetch";

export interface CreateTransportOptions {
  /** Gateway proxy URL */
  proxyUrl: string;

  /** Application ID (from callback) */
  appId: string;

  /** Optional custom fetch function */
  fetch?: typeof fetch;

  /** Whether to throw GatewayError on error responses */
  throwOnError?: boolean;
}

/**
 * Create a GatewayTransport for making signed requests.
 *
 * This is the main entry point for using the SDK after connection.
 * Uses GLUECO_PRIVATE_KEY from environment to sign all requests.
 *
 * @param options Configuration options
 * @returns GatewayTransport for use with plugin clients
 *
 * @throws KeyError if GLUECO_PRIVATE_KEY env var is missing or invalid
 *
 * @example
 * const transport = createTransport({
 *   proxyUrl: "https://gateway.example.com",
 *   appId: "app_abc123",
 * });
 *
 * // Use with plugins
 * import { groq } from "@glueco/plugin-llm-groq/client";
 * const client = groq(transport);
 */
export function createTransport(
  options: CreateTransportOptions
): GatewayTransport {
  const { proxyUrl, appId, throwOnError = false } = options;
  const fetchFn = resolveFetch(options.fetch);

  // Load seed from env (validates on first use)
  const seed = loadSeedFromEnv();

  // Helper to sign a request
  const signRequest = (
    method: string,
    url: URL,
    bodyBytes: Uint8Array
  ): Record<string, string> => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = generateNonce();
    const bodyHash = base64UrlEncode(sha256(bodyBytes));
    const pathWithQuery = getPathWithQuery(url);

    const canonicalPayload = buildCanonicalRequestV1({
      method: method.toUpperCase(),
      pathWithQuery,
      appId,
      ts: timestamp,
      nonce,
      bodyHash,
    });

    const signature = signToBase64Url(
      seed,
      new TextEncoder().encode(canonicalPayload)
    );

    return {
      "x-pop-v": POP_VERSION,
      "x-app-id": appId,
      "x-ts": timestamp,
      "x-nonce": nonce,
      "x-sig": signature,
    };
  };

  const transport: GatewayTransport = {
    async request<TResponse = unknown, TPayload = unknown>(
      resourceId: string,
      action: string,
      payload: TPayload,
      reqOptions?: GatewayRequestOptions
    ): Promise<GatewayResponse<TResponse>> {
      const [resourceType, provider] = resourceId.split(":");
      const actionPath = action.replace(".", "/");
      const url = new URL(
        `/r/${resourceType}/${provider}/${actionPath}`,
        proxyUrl
      );

      const method = reqOptions?.method ?? "POST";
      const bodyBytes = new TextEncoder().encode(JSON.stringify(payload));
      const popHeaders = signRequest(method, url, bodyBytes);

      const response = await fetchFn(url.toString(), {
        method,
        headers: {
          "Content-Type": "application/json",
          ...popHeaders,
          ...reqOptions?.headers,
        },
        body: JSON.stringify(payload),
        signal: reqOptions?.signal,
      });

      // Extract headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(errorBody);
        } catch {
          parsed = errorBody;
        }
        const error = parseGatewayError(parsed, response.status);
        throw error ?? new Error(`Gateway error: ${response.status} ${errorBody}`);
      }

      const data = (await response.json()) as TResponse;

      return {
        data,
        status: response.status,
        headers,
      };
    },

    async requestStream<TPayload = unknown>(
      resourceId: string,
      action: string,
      payload: TPayload,
      reqOptions?: Omit<GatewayRequestOptions, "stream">
    ): Promise<GatewayStreamResponse> {
      const [resourceType, provider] = resourceId.split(":");
      const actionPath = action.replace(".", "/");
      const url = new URL(
        `/r/${resourceType}/${provider}/${actionPath}`,
        proxyUrl
      );

      const method = reqOptions?.method ?? "POST";
      const streamPayload =
        typeof payload === "object" && payload !== null
          ? { ...payload, stream: true }
          : payload;
      const bodyBytes = new TextEncoder().encode(JSON.stringify(streamPayload));
      const popHeaders = signRequest(method, url, bodyBytes);

      const response = await fetchFn(url.toString(), {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...popHeaders,
          ...reqOptions?.headers,
        },
        body: JSON.stringify(streamPayload),
        signal: reqOptions?.signal,
      });

      // Extract headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(errorBody);
        } catch {
          parsed = errorBody;
        }
        const error = parseGatewayError(parsed, response.status);
        throw error ?? new Error(`Gateway error: ${response.status} ${errorBody}`);
      }

      if (!response.body) {
        throw new Error("No response body for streaming request");
      }

      return {
        stream: response.body,
        status: response.status,
        headers,
      };
    },

    getProxyUrl: () => proxyUrl,

    getFetch: () => fetchFn,
  };

  return transport;
}


