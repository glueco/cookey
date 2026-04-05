/**
 * Key management for the Glueco Gateway SDK.
 *
 * Loads Ed25519 private key seed from environment variable `GLUECO_PRIVATE_KEY`.
 * SDK never generates keys - the app provisions a key and stores it server-side.
 *
 * Key Format:
 *   GLUECO_PRIVATE_KEY must be base64-encoded 32-byte Ed25519 seed.
 *
 * Example:
 *   // Generate a key (one-time, outside SDK):
 *   const seed = crypto.getRandomValues(new Uint8Array(32));
 *   console.log(Buffer.from(seed).toString('base64'));
 *
 *   // Set in environment:
 *   export GLUECO_PRIVATE_KEY="base64-encoded-32-bytes..."
 *
 * IMPORTANT: This module is server-side only!
 * Attempting to use in browser will throw an error.
 */

import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

// Configure ed25519 to use sha512 (required for @noble/ed25519 v2.x)
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

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
        `Set it to a base64-encoded 32-byte Ed25519 seed.\n` +
        `Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }

  let seed: Uint8Array;
  try {
    seed = Uint8Array.from(Buffer.from(value, "base64"));
  } catch (e) {
    throw new KeyError(
      `Invalid format in ${ENV_PRIVATE_KEY}: ${e}\\n` +
        `Expected base64-encoded 32 bytes.`
    );
  }

  if (seed.length !== SEED_LENGTH) {
    throw new KeyError(
      `Invalid seed length in ${ENV_PRIVATE_KEY}: got ${seed.length} bytes, expected ${SEED_LENGTH}.\n` +
        `Must be exactly 32 bytes (256 bits) base64-encoded.`
    );
  }

  return seed;
}

/**
 * Derive Ed25519 public key from seed.
 *
 * @param seed 32-byte Ed25519 seed
 * @returns Public key as base64 string
 */
export function publicKeyFromSeed(seed: Uint8Array): string {
  const publicKey = ed25519.getPublicKey(seed);
  return Buffer.from(publicKey).toString("base64");
}

/**
 * Get public key bytes from seed.
 *
 * @param seed 32-byte Ed25519 seed
 * @returns 32-byte public key as Uint8Array
 */
export function getPublicKeyBytes(seed: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(seed);
}

/**
 * Sign a message with the Ed25519 seed.
 *
 * @param seed 32-byte Ed25519 seed
 * @param message Message bytes to sign
 * @returns 64-byte signature
 */
export function signWithSeed(seed: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, seed);
}

/**
 * Sign message and return base64url-encoded signature.
 *
 * @param seed 32-byte Ed25519 seed
 * @param message Message bytes to sign
 * @returns Base64URL-encoded signature
 */
export function signToBase64Url(seed: Uint8Array, message: Uint8Array): string {
  const signature = signWithSeed(seed, message);
  return base64UrlEncode(signature);
}

/**
 * Verify an Ed25519 signature.
 *
 * @param publicKey 32-byte public key
 * @param message Original message bytes
 * @param signature 64-byte signature
 * @returns True if valid
 */
export function verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

// ============================================
// BASE64 UTILITIES
// ============================================

export function base64UrlEncode(data: Uint8Array): string {
  let base64: string;

  if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(data).toString("base64");
  } else {
    base64 = btoa(String.fromCharCode(...data));
  }

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(str: string): Uint8Array {
  // Add padding
  let padded = str;
  while (padded.length % 4 !== 0) {
    padded += "=";
  }

  // Convert base64url to base64
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");

  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(base64, "base64"));
  } else {
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  }
}

export function base64Encode(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  } else {
    return btoa(String.fromCharCode(...data));
  }
}

export function base64Decode(str: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(str, "base64"));
  } else {
    return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  }
}

// ============================================
// NONCE GENERATION
// ============================================

/**
 * Generate a cryptographically random nonce (base64url encoded).
 * Used for PoP replay protection.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Node.js fallback
    const nodeCrypto = require("crypto");
    const randomBytes = nodeCrypto.randomBytes(16);
    bytes.set(randomBytes);
  }

  return base64UrlEncode(bytes);
}
