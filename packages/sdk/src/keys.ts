/**
 * Key management for the Cookey SDK.
 *
 * Loads Ed25519 private key seed from environment variable `GLUECO_PRIVATE_KEY`.
 *
 * Key Format:
 *   GLUECO_PRIVATE_KEY must be base64-encoded 32-byte Ed25519 seed.
 *
 * Example:
 *   // Generate a key (one-time):
 *   const { seedBase64 } = await generateKeyPair();
 *
 *   // Set in environment:
 *   export GLUECO_PRIVATE_KEY="base64-encoded-32-bytes..."
 *
 * IMPORTANT: env-based key loading is server-side only!
 */

import {
  ed25519Sign,
  ed25519PublicKey,
  ed25519Verify,
  ed25519GenerateKeyPair,
  randomBytes,
} from "./webcrypto";

// Environment variable name
export const ENV_PRIVATE_KEY = "GLUECO_PRIVATE_KEY";

// Expected seed length
const SEED_LENGTH = 32;

/**
 * Error thrown for key-related issues
 */
export class KeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyError";
  }
}

/**
 * Ensure we're running on server-side.
 * Throws if running in browser to prevent accidental key exposure.
 */
function ensureServerSide(): void {
  if (typeof window !== "undefined") {
    throw new KeyError(
      "GLUECO_PRIVATE_KEY must be used server-side only. " +
        "This SDK cannot be used in browser environments to prevent key leakage."
    );
  }
}

/**
 * Load Ed25519 seed from GLUECO_PRIVATE_KEY environment variable.
 *
 * @returns 32-byte seed as Uint8Array
 * @throws KeyError if env var is missing or invalid
 */
export function loadSeedFromEnv(): Uint8Array {
  ensureServerSide();

  const value = process.env[ENV_PRIVATE_KEY];

  if (!value) {
    throw new KeyError(
      `Missing environment variable: ${ENV_PRIVATE_KEY}\n` +
        `Set it to a base64-encoded 32-byte Ed25519 seed.`
    );
  }

  let seed: Uint8Array;
  try {
    seed = base64Decode(value.trim());
  } catch {
    throw new KeyError(`${ENV_PRIVATE_KEY} is not valid base64`);
  }

  if (seed.length !== SEED_LENGTH) {
    throw new KeyError(
      `${ENV_PRIVATE_KEY} must decode to ${SEED_LENGTH} bytes, got ${seed.length}`
    );
  }

  return seed;
}

/**
 * Derive the base64-encoded public key from a seed.
 */
export async function publicKeyFromSeed(seed: Uint8Array): Promise<string> {
  return base64Encode(await ed25519PublicKey(seed));
}

/**
 * Get raw public key bytes from a seed.
 */
export async function getPublicKeyBytes(seed: Uint8Array): Promise<Uint8Array> {
  return ed25519PublicKey(seed);
}

/**
 * Sign a message with a seed. Returns the raw 64-byte signature.
 */
export async function signWithSeed(
  seed: Uint8Array,
  message: Uint8Array
): Promise<Uint8Array> {
  return ed25519Sign(seed, message);
}

/**
 * Sign a message and return the signature base64url-encoded.
 */
export async function signToBase64Url(
  seed: Uint8Array,
  message: Uint8Array
): Promise<string> {
  return base64UrlEncode(await ed25519Sign(seed, message));
}

/**
 * Verify an Ed25519 signature.
 */
export async function verify(
  publicKeyBase64: string,
  signature: Uint8Array,
  message: Uint8Array
): Promise<boolean> {
  return ed25519Verify(base64Decode(publicKeyBase64), signature, message);
}

/**
 * Generate a fresh Ed25519 keypair.
 * Store seedBase64 as GLUECO_PRIVATE_KEY; send publicKeyBase64 in the
 * grant document.
 */
export async function generateKeyPair(): Promise<{
  seedBase64: string;
  publicKeyBase64: string;
}> {
  const { seed, publicKey } = await ed25519GenerateKeyPair();
  return {
    seedBase64: base64Encode(seed),
    publicKeyBase64: base64Encode(publicKey),
  };
}

/**
 * Generate a random nonce for PoP requests (≥16 chars).
 */
export function generateNonce(): string {
  return base64UrlEncode(randomBytes(18));
}

// ============================================
// BASE64 UTILITIES
// ============================================

export function base64Encode(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function base64UrlEncode(data: Uint8Array): string {
  return base64Encode(data)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  let padded = value.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  return base64Decode(padded);
}
