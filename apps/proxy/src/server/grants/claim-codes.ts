import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sha256 } from "@noble/hashes/sha256";
import { base64UrlEncode } from "@/lib/crypto";
import { createNotification } from "@/server/notifications";
import { getDisplayableToken } from "./tokens";
import type { Grant, GrantToken } from "@prisma/client";

// ============================================
// CLAIM CODES
// Single-use, 10-minute, hash-stored codes that deliver the bearer token
// to hosted apps via redirect: redirectUri?code=…&gateway=…
// ============================================

const CLAIM_CODE_TTL_MINUTES = 10;

function hashCode(code: string): string {
  return base64UrlEncode(sha256(new TextEncoder().encode(code)));
}

/**
 * Mint a claim code for a grant. Returns the plaintext code.
 */
export async function createClaimCode(grantId: string): Promise<string> {
  const code = randomBytes(24).toString("base64url");
  await prisma.claimCode.create({
    data: {
      codeHash: hashCode(code),
      grantId,
      expiresAt: new Date(Date.now() + CLAIM_CODE_TTL_MINUTES * 60 * 1000),
    },
  });
  return code;
}

export type ClaimExchangeResult =
  | { ok: true; token: string; grant: Grant }
  | { ok: false; status: 400 | 410; reason: string };

/**
 * Exchange a claim code for the grant's bearer token.
 * Single-use: a second exchange attempt 410s and notifies the owner.
 */
export async function exchangeClaimCode(
  code: string,
): Promise<ClaimExchangeResult> {
  const row = await prisma.claimCode.findUnique({
    where: { codeHash: hashCode(code) },
    include: { grant: { include: { tokens: true } } },
  });

  if (!row) {
    return { ok: false, status: 400, reason: "Invalid claim code" };
  }

  if (row.usedAt) {
    await createNotification(
      "claim_reuse",
      "Claim code reused",
      `A claim code for "${appName(row.grant)}" was presented a second time. ` +
        "If you did not expect this, consider revoking the grant.",
      { grantId: row.grantId },
    );
    return { ok: false, status: 410, reason: "Claim code already used" };
  }

  if (row.expiresAt < new Date()) {
    return { ok: false, status: 400, reason: "Claim code expired" };
  }

  const activeToken = row.grant.tokens.find(
    (t: GrantToken) => !t.revokedAt && t.expiresAt > new Date(),
  );
  const token = activeToken ? getDisplayableToken(activeToken) : null;
  if (!token) {
    return {
      ok: false,
      status: 400,
      reason: "No claimable token for this grant — ask the owner to regenerate it",
    };
  }

  await prisma.claimCode.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  return { ok: true, token, grant: row.grant };
}

function appName(grant: Grant): string {
  const doc = grant.document as { app?: { name?: string } } | null;
  return doc?.app?.name ?? grant.appId;
}
