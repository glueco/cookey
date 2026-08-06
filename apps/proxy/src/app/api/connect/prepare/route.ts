import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyConnectCode } from "@/server/pairing";
import { createPendingGrant, GrantServiceError } from "@/server/grants/service";
import { createErrorResponse, ErrorCode } from "@/shared";
import { CORS_PREFLIGHT_HEADERS } from "@/lib/cors";

// ============================================
// POST /api/connect/prepare
// App-initiated grant submission (5.2 path 2): a grant document plus a
// pairing code. Creates a PENDING Grant and returns the approval URL.
// This endpoint accepts ONLY { connectCode, grant } — pre-grant request
// shapes get a clear 400 pointing at the spec (Addendum A).
// ============================================

// Approval-window hint returned to polling clients (the grant itself has
// no hard session TTL; stale PENDING grants are pruned by cron)
const APPROVAL_WINDOW_MINUTES = 30;

const PrepareSchema = z.object({
  connectCode: z.string().min(16),
  grant: z.record(z.unknown()),
});

/** Old SDK 0.4.0 request shapes, recognized only to give a useful error. */
function looksLikeOldFormat(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "requestedPermissions" in body &&
    !("grant" in body)
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      createErrorResponse(ErrorCode.ERR_INVALID_JSON, "Invalid JSON body"),
      { status: 400 },
    );
  }

  const parsed = PrepareSchema.safeParse(body);

  if (!parsed.success) {
    const message = looksLikeOldFormat(body)
      ? "This gateway no longer accepts the pre-grant request format. Send { connectCode, grant: <grant document> } — see docs/GRANT_SPEC.md (SDK ≥ 1.0.0: submitGrant())."
      : "Invalid request. Send { connectCode, grant: <grant document> } — see docs/GRANT_SPEC.md.";
    return NextResponse.json(
      createErrorResponse(ErrorCode.ERR_INVALID_REQUEST, message),
      { status: 400 },
    );
  }

  const codeValid = await verifyConnectCode(parsed.data.connectCode);
  if (!codeValid) {
    return NextResponse.json(
      createErrorResponse(
        ErrorCode.ERR_INVALID_CONNECT_CODE,
        "Invalid or expired connect code",
      ),
      { status: 400 },
    );
  }

  try {
    const grant = await createPendingGrant(parsed.data.grant);

    const gatewayUrl = process.env.GATEWAY_URL ?? "";
    const expiresAt = new Date(
      Date.now() + APPROVAL_WINDOW_MINUTES * 60 * 1000,
    );

    return NextResponse.json({
      grantId: grant.id,
      // sessionToken mirrors grantId for /api/connect/status polling
      sessionToken: grant.id,
      approvalUrl: `${gatewayUrl}/connect/approve?grant=${grant.id}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof GrantServiceError) {
      return NextResponse.json(
        createErrorResponse(ErrorCode.ERR_INVALID_REQUEST, error.message),
        { status: error.status },
      );
    }
    console.error("Prepare error:", error);
    return NextResponse.json(
      createErrorResponse(
        ErrorCode.ERR_INTERNAL,
        "Failed to prepare grant submission",
      ),
      { status: 500 },
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_PREFLIGHT_HEADERS,
  });
}
