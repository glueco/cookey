// ============================================
// SERVER-SIDE GATEWAY CLIENT
// Creates transport for PoP-signed requests
// Uses GLUECO_PRIVATE_KEY from environment
// ============================================

import {
  createTransport,
  loadSeedFromEnv,
  publicKeyFromSeed,
  type GatewayTransport,
} from "@glueco/sdk";

/**
 * Create a server-side transport for gateway requests.
 * Uses GLUECO_PRIVATE_KEY for PoP signing.
 */
export function createServerTransport(
  gatewayUrl: string,
  appId: string
): GatewayTransport {
  return createTransport({
    proxyUrl: gatewayUrl,
    appId,
  });
}

/**
 * Get the public key from GLUECO_PRIVATE_KEY.
 * Used when connecting to a gateway.
 */
export function getPublicKey(): string {
  const seed = loadSeedFromEnv();
  return publicKeyFromSeed(seed);
}

// Re-export types for convenience
export type { GatewayTransport } from "@glueco/sdk";
