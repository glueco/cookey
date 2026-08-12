import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/client-ip";
import { checkRateLimit } from "@/server/limits/rate-limit";
import { hashToken, TOKEN_PREFIX } from "@/server/grants/tokens";
import { CORS_HEADERS, createPreflightResponse } from "@/lib/cors";

// ============================================
// GET /v1/token/verify
// Credential check for a ck_ bearer token: is it valid, what does it
// reach, when does it expire. Used by the "Test this token" button on
// the post-approval screen, and available to apps as a self-check.
//
// Deliberately NOT authenticateBearer(): that records a use, and first
// use wipes the encrypted token copy that backs the owner's
// "reveal later" window. Verifying a credential must not spend it —
// no side effects, no provider call, nothing metered.
// ============================================

const VERIFY_RATE_LIMIT = 20;
const VERIFY_RATE_WINDOW_SECS = 60;

export async function OPTIONS() {
  return createPreflightResponse();
}

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request) ?? "unknown";
  const rate = await checkRateLimit(
    `verify:${clientIp}`,
    VERIFY_RATE_LIMIT,
    VERIFY_RATE_WINDOW_SECS,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { valid: false, reason: "Too many attempts; retry later" },
      { status: 429, headers: CORS_HEADERS },
    );
  }

  const header = request.headers.get("authorization");
  const token =
    header && header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token || !token.startsWith(TOKEN_PREFIX)) {
    return NextResponse.json(
      { valid: false, reason: "Send the token as: Authorization: Bearer ck_…" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const row = await prisma.grantToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      grant: {
        include: {
          permissions: {
            where: { status: "ACTIVE" },
            select: { resourceId: true, action: true },
          },
        },
      },
    },
  });

  const failure =
    !row || row.revokedAt
      ? "This token is not valid — it may have been revoked or regenerated"
      : row.expiresAt < new Date()
        ? `This token expired on ${row.expiresAt.toISOString().slice(0, 10)}`
        : row.grant.status !== "ACTIVE"
          ? `The grant behind this token is ${row.grant.status.toLowerCase().replace(/_/g, " ")}`
          : null;

  if (failure || !row) {
    return NextResponse.json(
      { valid: false, reason: failure },
      { status: 200, headers: CORS_HEADERS },
    );
  }

  const services = [
    ...new Set(row.grant.permissions.map((p) => p.resourceId)),
  ].sort();

  return NextResponse.json(
    {
      valid: true,
      grantId: row.grantId,
      expiresAt: row.expiresAt.toISOString(),
      services,
      operations: row.grant.permissions.length,
    },
    { status: 200, headers: CORS_HEADERS },
  );
}
