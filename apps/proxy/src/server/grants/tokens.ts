import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";

// ============================================
// GRANT TOKENS (static bearer credentials)
// Format: "ck_" + 40 base62 chars from CSPRNG.
// Only the SHA-256 hex of the full token is stored; the first 12 chars
// are kept in plaintext for UI identification.
// ============================================

export const TOKEN_PREFIX = "ck_";
const TOKEN_RANDOM_LENGTH = 40;
const DISPLAY_PREFIX_LENGTH = 12;
const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Generate a new token string (not persisted).
 */
export function generateTokenString(): string {
  let out = "";
  while (out.length < TOKEN_RANDOM_LENGTH) {
    // Rejection sampling to avoid modulo bias: 62 * 4 = 248 <= 256
    const bytes = randomBytes(TOKEN_RANDOM_LENGTH);
    for (const byte of bytes) {
      if (byte < 248 && out.length < TOKEN_RANDOM_LENGTH) {
        out += BASE62[byte % 62];
      }
    }
  }
  return TOKEN_PREFIX + out;
}

/**
 * SHA-256 hex of a token — the only form ever stored.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mint and persist a bearer token for a grant.
 * Returns the plaintext token — the ONLY time it exists outside the caller.
 */
export async function mintGrantToken(
  grantId: string,
  expiresAt: Date,
): Promise<{ token: string; tokenId: string }> {
  const token = generateTokenString();
  const row = await prisma.grantToken.create({
    data: {
      grantId,
      tokenHash: hashToken(token),
      displayPrefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
      expiresAt,
    },
  });
  return { token, tokenId: row.id };
}

/**
 * Revoke all active tokens for a grant.
 */
export async function revokeGrantTokens(grantId: string): Promise<number> {
  const result = await prisma.grantToken.updateMany({
    where: { grantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/**
 * Token expiry rule: min(grant expiry, current renewal period end).
 * Falls back to grant expiry alone for non-renewable grants; a grant with
 * neither is capped far in the future (bearer grants always get an expiry
 * at approval, so this is a safety net).
 */
export function computeTokenExpiry(grant: {
  expiresAt: Date | null;
  currentPeriodEnd: Date | null;
}): Date {
  const candidates = [grant.expiresAt, grant.currentPeriodEnd].filter(
    (d): d is Date => d !== null,
  );
  if (candidates.length === 0) {
    return new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
  }
  return new Date(Math.min(...candidates.map((d) => d.getTime())));
}
