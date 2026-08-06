import { z } from "zod";

// ============================================
// PoP (Proof of Possession) PROTOCOL
// Canonical signing rules and header schemas
// ============================================

/**
 * PoP header schema for v1 protocol.
 * Validates all required headers for PoP authentication.
 */
export const PopHeadersV1Schema = z.object({
  "x-pop-v": z.literal("1"),
  "x-app-id": z.string().min(1, "App ID is required"),
  "x-ts": z.string().regex(/^\d+$/, "Timestamp must be numeric"),
  "x-nonce": z.string().min(16, "Nonce must be at least 16 characters"),
  "x-sig": z.string().min(1, "Signature is required"),
});

export type PopHeadersV1 = z.infer<typeof PopHeadersV1Schema>;

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
 *
 * @param params - The canonical request parameters
 * @returns The canonical request string to be signed
 *
 * @example
 * const canonical = buildCanonicalRequestV1({
 *   method: "POST",
 *   pathWithQuery: "/v1/chat/completions?stream=true",
 *   appId: "app_123",
 *   ts: "1706000000",
 *   nonce: "abc123xyz456def7",
 *   bodyHash: "base64url-sha256-hash",
 * });
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
 *
 * @example
 * getPathWithQuery(new URL("https://example.com/v1/chat?stream=true"))
 * // Returns: "/v1/chat?stream=true"
 *
 * getPathWithQuery(new URL("https://example.com/v1/chat"))
 * // Returns: "/v1/chat"
 */
export function getPathWithQuery(url: URL): string {
  return url.pathname + url.search;
}

/**
 * Current PoP protocol version.
 */
export const POP_VERSION = "1" as const;

/**
 * Error codes specific to PoP authentication.
 */
export enum PopErrorCode {
  UNSUPPORTED_VERSION = "ERR_UNSUPPORTED_POP_VERSION",
}
