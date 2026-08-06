import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ErrorCode } from "@glueco/shared";
import { hashToken, TOKEN_PREFIX } from "@/server/grants/tokens";
import type { Grant, GrantToken } from "@prisma/client";

// ============================================
// BEARER TOKEN AUTHENTICATION
// Authorization: Bearer ck_… → GrantToken hash lookup.
// Timing-safe by construction: lookup is by exact SHA-256 hash.
// ============================================

// lastUsed writes are throttled to at most once per minute per token
// to avoid write amplification on hot tokens.
const LAST_USED_THROTTLE_MS = 60 * 1000;

export interface BearerAuthResult {
  success: boolean;
  grant?: Grant;
  token?: GrantToken;
  error?: string;
  errorCode?: ErrorCode;
}

/**
 * Extract a candidate grant token from the Authorization header.
 * Returns null when the header is absent or not a ck_ bearer token.
 */
export function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.startsWith(TOKEN_PREFIX) ? token : null;
}

/**
 * Authenticate a request bearing a ck_ token.
 */
export async function authenticateBearer(
  token: string,
  clientIp: string | null,
): Promise<BearerAuthResult> {
  const row = await prisma.grantToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { grant: true },
  });

  if (!row) {
    return {
      success: false,
      error: "Invalid token",
      errorCode: ErrorCode.ERR_INVALID_TOKEN,
    };
  }

  if (row.revokedAt) {
    return {
      success: false,
      error: "Token has been revoked",
      errorCode: ErrorCode.ERR_INVALID_TOKEN,
    };
  }

  if (row.expiresAt < new Date()) {
    return {
      success: false,
      error: `Token expired at ${row.expiresAt.toISOString()}`,
      errorCode: ErrorCode.ERR_TOKEN_EXPIRED,
    };
  }

  recordTokenUse(row, clientIp).catch(() => {
    // Usage tracking must never fail the request
  });

  const { grant, ...tokenRow } = row;
  return { success: true, grant, token: tokenRow as GrantToken };
}

/**
 * Track firstUsedAt (closes the copy-paste display window) and throttled
 * lastUsedAt/lastUsedIp on both the token and its grant.
 */
async function recordTokenUse(
  row: GrantToken & { grant: Grant },
  clientIp: string | null,
): Promise<void> {
  const now = new Date();
  const stale =
    !row.lastUsedAt ||
    now.getTime() - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS;
  const ipChanged = clientIp !== null && clientIp !== row.lastUsedIp;

  if (!row.firstUsedAt || stale || ipChanged) {
    await Promise.all([
      prisma.grantToken.update({
        where: { id: row.id },
        data: {
          firstUsedAt: row.firstUsedAt ?? now,
          lastUsedAt: now,
          ...(clientIp && { lastUsedIp: clientIp }),
          // First use closes the copy-paste window: drop the encrypted copy
          ...(!row.firstUsedAt && { encryptedToken: null, tokenIv: null }),
        },
      }),
      prisma.grant.update({
        where: { id: row.grantId },
        data: {
          lastUsedAt: now,
          ...(clientIp && { lastUsedIp: clientIp }),
        },
      }),
    ]);
  }
}
