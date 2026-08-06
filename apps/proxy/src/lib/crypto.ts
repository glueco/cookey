import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { sha256 } from "@noble/hashes/sha256";

// Configure ed25519 to use sha512
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

// ============================================
// PoP SIGNATURE VERIFICATION
// ============================================

export interface PoPHeaders {
  popVersion: string | null;
  appId: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

/**
 * Compute SHA-256 hash of body and encode as base64url.
 */
export function hashBody(body: Uint8Array | string): string {
  const bytes =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  const hash = sha256(bytes);
  return base64UrlEncode(hash);
}

/**
 * Verify an Ed25519 signature using a pre-built canonical string.
 * This is the preferred method - use buildCanonicalRequestV1 from @/shared.
 */
export async function verifySignatureWithCanonical(
  publicKeyBase64: string,
  signatureBase64: string,
  canonicalString: string,
): Promise<boolean> {
  try {
    const publicKey = base64Decode(publicKeyBase64);
    const signature = base64Decode(signatureBase64);
    const message = new TextEncoder().encode(canonicalString);

    return await ed.verifyAsync(signature, message, publicKey);
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

/**
 * Validate timestamp is within acceptable window (±90 seconds).
 */
export function validateTimestamp(
  timestamp: string,
  windowSeconds: number = 90,
): boolean {
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  const now = Math.floor(Date.now() / 1000);
  const diff = Math.abs(now - ts);

  return diff <= windowSeconds;
}

// ============================================
// BASE64 UTILITIES
// ============================================

/**
 * Encode bytes to standard base64.
 */
export function base64Encode(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  // Browser fallback
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Decode base64 string to bytes.
 */
export function base64Decode(str: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(str, "base64"));
  }
  // Browser fallback
  return new Uint8Array(
    atob(str)
      .split("")
      .map((c) => c.charCodeAt(0)),
  );
}

/**
 * Encode bytes to base64url (URL-safe base64).
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  return base64Encode(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode base64url string to bytes.
 */
export function base64UrlDecode(str: string): Uint8Array {
  // Add padding if needed
  let padded = str.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) {
    padded += "=";
  }
  return base64Decode(padded);
}
