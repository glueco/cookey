import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exchangeClaimCode } from "@/server/grants/claim-codes";
import { checkRateLimit } from "@/server/limits/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { createErrorResponse, ErrorCode } from "@glueco/shared";
import { CORS_HEADERS, CORS_PREFLIGHT_HEADERS } from "@/lib/cors";

// ============================================
// POST /v1/token/claim
// Exchange a single-use claim code for the grant's bearer token.
// { code } → { token, grantId, expiresAt }
// Reuse → 410 + owner notification. IP rate-limited.
// ============================================

const CLAIM_RATE_LIMIT = 10;
const CLAIM_RATE_WINDOW_SECS = 60;

const ClaimRequestSchema = z.object({
  code: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request) ?? "unknown";
  const rate = await checkRateLimit(
    `claim:${clientIp}`,
    CLAIM_RATE_LIMIT,
    CLAIM_RATE_WINDOW_SECS,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      createErrorResponse(
        ErrorCode.ERR_RATE_LIMIT_EXCEEDED,
        "Too many claim attempts; retry later",
      ),
      { status: 429, headers: CORS_HEADERS },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      createErrorResponse(ErrorCode.ERR_INVALID_JSON, "Invalid JSON body"),
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const parsed = ClaimRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      createErrorResponse(ErrorCode.ERR_INVALID_REQUEST, "code is required"),
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const result = await exchangeClaimCode(parsed.data.code);

  if (!result.ok) {
    const code =
      result.status === 410
        ? ErrorCode.ERR_CLAIM_CODE_USED
        : ErrorCode.ERR_INVALID_CLAIM_CODE;
    return NextResponse.json(createErrorResponse(code, result.reason), {
      status: result.status,
      headers: CORS_HEADERS,
    });
  }

  const activeToken = await prisma.grantToken.findFirst({
    where: { grantId: result.grant.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { expiresAt: true },
  });

  return NextResponse.json(
    {
      token: result.token,
      grantId: result.grant.id,
      expiresAt: activeToken?.expiresAt.toISOString() ?? null,
    },
    { headers: CORS_HEADERS },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_PREFLIGHT_HEADERS,
  });
}
