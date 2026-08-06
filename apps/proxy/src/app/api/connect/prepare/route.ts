import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyConnectCode } from "@/server/pairing";
import { createPendingGrant, GrantServiceError } from "@/server/grants/service";
import { createErrorResponse, ErrorCode } from "@glueco/shared";
import { CORS_PREFLIGHT_HEADERS } from "@/lib/cors";

// ============================================
// POST /api/connect/prepare
// App-initiated grant submission (5.2 path 2): a grant document plus a
// pairing code. Creates a PENDING Grant and returns the approval URL.
// Legacy flat/nested permission formats are normalized into grant
// documents so old SDK clients keep working (deprecated).
// ============================================

// Approval-window hint returned to polling clients (the grant itself has
// no hard session TTL; stale PENDING grants are pruned by cron).
const APPROVAL_WINDOW_MINUTES = 30;

const GrantPrepareSchema = z.object({
  connectCode: z.string().min(16),
  grant: z.record(z.unknown()),
});

/**
 * Legacy request schema (flat app fields at top level).
 * @deprecated Send { connectCode, grant: <grant document> } instead.
 */
const LegacyPrepareRequestSchema = z.object({
  connectCode: z.string().min(1),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  homepage: z.string().url().optional(),
  app: z
    .object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      homepage: z.string().url().optional(),
    })
    .optional(),
  publicKey: z.string().min(1),
  requestedPermissions: z.array(
    z.object({
      resourceId: z.string().min(1),
      actions: z.array(z.string().min(1)).min(1),
      constraints: z.record(z.unknown()).optional(),
    }),
  ),
  redirectUri: z.string().url(),
});

/**
 * Normalize any accepted request body into { connectCode, grantDocument }.
 */
function normalizeRequest(
  body: unknown,
): { connectCode: string; document: Record<string, unknown> } | null {
  const grantFormat = GrantPrepareSchema.safeParse(body);
  if (grantFormat.success) {
    return {
      connectCode: grantFormat.data.connectCode,
      document: grantFormat.data.grant,
    };
  }

  const legacy = LegacyPrepareRequestSchema.safeParse(body);
  if (legacy.success) {
    const data = legacy.data;
    const app = data.app ?? {
      name: data.name ?? "",
      description: data.description,
      homepage: data.homepage,
    };
    if (!app.name) return null;

    return {
      connectCode: data.connectCode,
      document: {
        specVersion: "1",
        legacy: true,
        app,
        runtime: "server",
        auth: "pop",
        publicKey: data.publicKey,
        requests: data.requestedPermissions.map((perm) => ({
          resource: perm.resourceId,
          actions: perm.actions,
          reason: "(legacy request — no reason provided)",
          ...(perm.constraints && { constraints: perm.constraints }),
        })),
        duration: "1_month",
        redirectUri: data.redirectUri,
      },
    };
  }

  return null;
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

  const normalized = normalizeRequest(body);

  if (!normalized) {
    return NextResponse.json(
      createErrorResponse(
        ErrorCode.ERR_INVALID_REQUEST,
        "Invalid request. Send { connectCode, grant: <grant document> } — see the app developer guide.",
      ),
      { status: 400 },
    );
  }

  const codeValid = await verifyConnectCode(normalized.connectCode);
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
    const grant = await createPendingGrant(normalized.document);

    const gatewayUrl = process.env.GATEWAY_URL ?? "";
    const expiresAt = new Date(
      Date.now() + APPROVAL_WINDOW_MINUTES * 60 * 1000,
    );

    return NextResponse.json({
      // sessionToken kept for wire compatibility with old SDK clients;
      // it is the grant id and works with /api/connect/status as before.
      sessionToken: grant.id,
      grantId: grant.id,
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
