import { sha256 } from "@noble/hashes/sha256";
import {
  buildCanonicalRequestV1,
  getPathWithQuery,
  POP_VERSION,
} from "@glueco/shared";
import { loadSeedFromEnv, signToBase64Url, base64UrlEncode, generateNonce } from "./keys";
import { GatewayError, parseGatewayError } from "./errors";

// ============================================
// GATEWAY FETCH
// PoP-enabled fetch wrapper for runtime requests
// ============================================

export interface GatewayFetchOptions {
  /** App ID received after approval */
  appId: string;

  /** Gateway/proxy URL */
  proxyUrl: string;

  /** Optional: Ed25519 seed bytes (if not provided, uses GLUECO_PRIVATE_KEY env) */
  seed?: Uint8Array;

  /** Optional base fetch function (for testing) */
  baseFetch?: typeof fetch;

  /** Whether to throw GatewayError on error responses (default: false for compatibility) */
  throwOnError?: boolean;
}

export type GatewayFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Create a PoP-enabled fetch function.
 *
 * This wrapper:
 * - Adds PoP headers (x-pop-v, x-app-id, x-ts, x-nonce, x-sig)
 * - Routes requests through the gateway
 * - Preserves request body and headers
 * - Includes query params in signature (v1 protocol)
 *
 * @example
 * const gatewayFetch = createGatewayFetch({
 *   appId: 'clx123...',
 *   proxyUrl: 'https://gateway.example.com',
 *   keyPair: { publicKey: '...', privateKey: '...' },
 * });
 *
 * // Use with OpenAI SDK - explicit resource in URL
 * const client = new OpenAI({
 *   apiKey: 'unused',
 *   baseURL: 'https://gateway.example.com/r/llm/groq', // Note: /r/<type>/<provider>
 *   fetch: gatewayFetch,
 * });
 */
export function createGatewayFetch(options: GatewayFetchOptions): GatewayFetch {
  const { appId, proxyUrl, seed, baseFetch, throwOnError = false } = options;

  // Use provided seed or load from env
  const actualSeed = seed ?? loadSeedFromEnv();
  const fetchFn = resolveFetch(baseFetch);

  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // Parse the URL - handle relative URLs by using proxyUrl as base
    const proxyUrlObj = new URL(proxyUrl);
    let url: URL;

    if (typeof input === "string") {
      // Handle both absolute and relative URLs
      // Relative URLs like "/r/llm/groq/v1/chat" will use proxyUrl as base
      url = new URL(input, proxyUrlObj);
    } else if (input instanceof URL) {
      url = input;
    } else {
      // Request object
      url = new URL(input.url, proxyUrlObj);
    }

    const method = init?.method || "GET";

    // Get body bytes
    let bodyBytes: Uint8Array;
    if (init?.body) {
      if (typeof init.body === "string") {
        bodyBytes = new TextEncoder().encode(init.body);
      } else if (init.body instanceof ArrayBuffer) {
        bodyBytes = new Uint8Array(init.body);
      } else if (init.body instanceof Uint8Array) {
        bodyBytes = init.body;
      } else {
        // For other body types, convert to string
        bodyBytes = new TextEncoder().encode(String(init.body));
      }
    } else {
      bodyBytes = new Uint8Array(0);
    }

    // Generate PoP headers
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = generateNonce();
    const bodyHash = base64UrlEncode(sha256(bodyBytes));

    // Get path with query string for canonical request
    const pathWithQuery = getPathWithQuery(url);

    // Create canonical payload using shared builder
    const canonicalPayload = buildCanonicalRequestV1({
      method: method.toUpperCase(),
      pathWithQuery,
      appId,
      ts: timestamp,
      nonce,
      bodyHash,
    });

    // Sign the payload
    const signature = signToBase64Url(
      actualSeed,
      new TextEncoder().encode(canonicalPayload),
    );

    // Merge headers
    const headers = new Headers(init?.headers);
    headers.set("x-pop-v", POP_VERSION);
    headers.set("x-app-id", appId);
    headers.set("x-ts", timestamp);
    headers.set("x-nonce", nonce);
    headers.set("x-sig", signature);

    // Route through proxy - construct final URL using pathname + search
    // This ensures we always hit the proxy, regardless of input URL origin
    const targetUrl = new URL(url.pathname + url.search, proxyUrlObj);

    // Make the request
    const response = await fetchFn(targetUrl.toString(), {
      ...init,
      headers,
    });

    // Optionally throw on error responses
    if (throwOnError && !response.ok) {
      const body = await response
        .clone()
        .json()
        .catch(() => ({}));
      const gatewayError = parseGatewayError(body, response.status);

      if (gatewayError) {
        throw gatewayError;
      }

      throw new Error(
        `Gateway request failed: ${response.status} ${response.statusText}`,
      );
    }

    return response;
  };
}

/**
 * Create a gateway fetch from environment variables.
 * Expects: GATEWAY_APP_ID, GATEWAY_PROXY_URL, GLUECO_PRIVATE_KEY
 */
export function createGatewayFetchFromEnv(
  options?: Pick<GatewayFetchOptions, "baseFetch" | "throwOnError">,
): GatewayFetch {
  const appId = process.env.GATEWAY_APP_ID;
  const proxyUrl = process.env.GATEWAY_PROXY_URL;

  if (!appId || !proxyUrl) {
    throw new Error(
      "Missing required environment variables: GATEWAY_APP_ID, GATEWAY_PROXY_URL",
    );
  }

  // seed will be loaded from GLUECO_PRIVATE_KEY inside createGatewayFetch
  return createGatewayFetch({
    appId,
    proxyUrl,
    ...options,
  });
}

// ============================================
// FETCH RESOLUTION
// ============================================

/**
 * Resolve fetch implementation.
 * Uses provided fetch, falls back to global, or throws clear error.
 */
export function resolveFetch(customFetch?: typeof fetch): typeof fetch {
  if (customFetch) {
    return customFetch;
  }

  if (typeof globalThis.fetch !== "undefined") {
    return globalThis.fetch;
  }

  if (typeof window !== "undefined" && typeof window.fetch !== "undefined") {
    return window.fetch;
  }

  throw new Error(
    "No fetch implementation available. Please provide a fetch function via options or ensure global fetch is available.",
  );
}


