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

// ============================================
// ACTIVE SEED OVERRIDE
// After a successful key rotation the gateway only accepts the new key,
// but the SDK keeps loading the old GLUECO_PRIVATE_KEY from env. This
// module-level override holds the rotated seed so subsequent requests
// sign correctly.
//
// NOTE: the override is process-local and resets on server restart —
// update GLUECO_PRIVATE_KEY in the environment for persistence.
// ============================================

let activeSeedOverride: Uint8Array | null = null;

/**
 * Set the active signing seed after a successful rotation.
 * Process-local: resets on restart (update GLUECO_PRIVATE_KEY to persist).
 */
export function setActiveSeed(seed: Uint8Array): void {
  activeSeedOverride = seed;
  // The SDK's createTransport()/loadSeedFromEnv() read GLUECO_PRIVATE_KEY,
  // so mirror the override into the process env for SDK helpers. This only
  // mutates this process's env, not the .env file.
  process.env.GLUECO_PRIVATE_KEY = Buffer.from(seed).toString("base64");
}

/**
 * Get the currently active signing seed (rotation override, or env).
 */
export function getActiveSeed(): Uint8Array {
  return activeSeedOverride ?? loadSeedFromEnv();
}

/**
 * Create a server-side transport for gateway requests.
 * Uses the active seed (GLUECO_PRIVATE_KEY, or the rotation override
 * mirrored into it by setActiveSeed) for PoP signing.
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
 * Get the public key for the active seed.
 * Used when connecting to a gateway.
 */
export async function getPublicKey(): Promise<string> {
  const seed = getActiveSeed();
  return publicKeyFromSeed(seed);
}

// Re-export types for convenience
export type { GatewayTransport } from "@glueco/sdk";
