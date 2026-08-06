// ============================================
// @glueco/sdk — COOKEY GATEWAY SDK (PoP only)
// Thin Ed25519 signing + transport layer, zero runtime dependencies.
//
// Bearer-token users DO NOT need this SDK: a ck_ token works with any
// HTTP client or an unmodified OpenAI SDK. This package exists solely
// for long-lived PoP grants.
// ============================================

// Simple transport creation (RECOMMENDED for PoP)
// Uses GLUECO_PRIVATE_KEY from environment
export { createTransport, type CreateTransportOptions } from "./createTransport";

// Transport interface
export {
  type GatewayTransport,
  type GatewayRequestOptions,
  type GatewayResponse,
  type GatewayStreamResponse,
} from "./transport";

// PoP-signed fetch wrapper (use with vendor SDKs that accept custom fetch)
export {
  createGatewayFetch,
  createGatewayFetchFromEnv,
  resolveFetch,
  type GatewayFetchOptions,
  type GatewayFetch,
} from "./fetch";

// Connect/pairing flow (submits grant documents to /api/connect/prepare)
export {
  parsePairingString,
  createPairingString,
  type PairingInfo,
} from "./pairing";
export {
  submitGrant,
  ConnectError,
  type ConnectResult,
  type GrantSubmitOptions,
} from "./connect";

// Errors
export { GatewayError, parseGatewayError, isGatewayError } from "./errors";

// Canonical PoP v1 wire contract (vendored; see docs/POP_PROTOCOL.md)
export {
  POP_VERSION,
  buildCanonicalRequestV1,
  getPathWithQuery,
  type CanonicalRequestParams,
} from "./canonical";

// Keys (env-loading is server-side only!)
export {
  loadSeedFromEnv,
  publicKeyFromSeed,
  getPublicKeyBytes,
  signWithSeed,
  signToBase64Url,
  verify,
  generateKeyPair,
  generateNonce,
  KeyError,
  ENV_PRIVATE_KEY,
  base64Encode,
  base64Decode,
  base64UrlEncode,
  base64UrlDecode,
} from "./keys";
