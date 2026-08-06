// ============================================
// PoP v1 CANONICAL REQUEST (vendored)
// This ~100-line block is the wire contract between the SDK and the
// gateway. docs/POP_PROTOCOL.md is the normative spec; cross-language
// test vectors live in sdks/test-vectors.json and are consumed by both
// test suites. The gateway keeps its own copy — do not import server
// code from here.
// ============================================

/**
 * Current PoP protocol version.
 */
export const POP_VERSION = "1" as const;

/**
 * Parameters for building a canonical request string.
 */
export interface CanonicalRequestParams {
  /** HTTP method (will be uppercased) */
  method: string;
  /** URL path with query string (e.g., "/v1/chat/completions?stream=true") */
  pathWithQuery: string;
  /** App ID from x-app-id header */
  appId: string;
  /** Unix timestamp from x-ts header */
  ts: string;
  /** Nonce from x-nonce header */
  nonce: string;
  /** Base64url-encoded SHA-256 hash of request body */
  bodyHash: string;
}

/**
 * Build the canonical request string for PoP v1 signature.
 *
 * Format:
 * ```
 * v1\n
 * <METHOD>\n
 * <PATH_WITH_QUERY>\n
 * <APP_ID>\n
 * <TS>\n
 * <NONCE>\n
 * <BODY_HASH>\n
 * ```
 */
export function buildCanonicalRequestV1(
  params: CanonicalRequestParams,
): string {
  return [
    "v1",
    params.method.toUpperCase(),
    params.pathWithQuery,
    params.appId,
    params.ts,
    params.nonce,
    params.bodyHash,
    "", // trailing newline
  ].join("\n");
}

/**
 * Extract path with query from a URL.
 * Combines pathname and search (including '?' when present).
 */
export function getPathWithQuery(url: URL): string {
  return url.pathname + url.search;
}
