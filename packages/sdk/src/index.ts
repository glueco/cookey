// ============================================
// @glueco/sdk - PERSONAL RESOURCE GATEWAY SDK
// Thin transport + signing layer (env-only design)
// ============================================

// Simple transport creation (RECOMMENDED)
// Uses GLUECO_PRIVATE_KEY from environment
export { createTransport, type CreateTransportOptions } from "./createTransport";

// Transport interface for plugin clients
// This is the primary interface plugins should depend on
export {
  type GatewayTransport,
  type GatewayRequestOptions,
  type GatewayResponse,
  type GatewayStreamResponse,
  type PluginClientFactory,
  type PluginClient,
} from "./transport";

// Core transport (legacy - prefer createTransport)
export {
  createGatewayFetch,
  createGatewayFetchFromEnv,
  resolveFetch,
  type GatewayFetchOptions,
  type GatewayFetch,
} from "./fetch";

// Connect/pairing flow
export {
  parsePairingString,
  createPairingString,
  type PairingInfo,
} from "./pairing";
export {
  connect,
  handleCallback,
  ConnectError,
  type ConnectOptions,
  type ConnectResult,
} from "./connect";

// Errors
export { GatewayError, parseGatewayError, isGatewayError } from "./errors";

// Keys (env-only - server-side only!)
export {
  loadSeedFromEnv,
  publicKeyFromSeed,
  getPublicKeyBytes,
  signWithSeed,
  signToBase64Url,
  verify,
  generateNonce,
  KeyError,
  ENV_PRIVATE_KEY,
  base64UrlEncode,
  base64UrlDecode,
} from "./keys";

// High-level client (legacy - prefer createTransport)
export {
  GatewayClient,
  MemoryConfigStorage,
  FileConfigStorage,
  EnvConfigStorage,
  type GatewayClientOptions,
  type ConfigStorage,
  type GatewayConfig,
} from "./client";

