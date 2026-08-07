import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CORS_PREFLIGHT_HEADERS } from "@/lib/cors";

// ============================================
// GET /api/connect/status
// Poll for grant approval status. Response shape unchanged from the
// install-session era; the session token is now the grant id.
// ============================================

export async function GET(request: NextRequest) {
  const sessionToken = request.nextUrl.searchParams.get("session");

  if (!sessionToken) {
    return NextResponse.json(
      { error: "Missing session parameter" },
      { status: 400 }
    );
  }

  try {
    const grant = await prisma.grant.findUnique({
      where: { id: sessionToken },
    });

    if (!grant) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    switch (grant.status) {
      case "PENDING":
        return NextResponse.json({
          status: "pending",
        });

      case "ACTIVE": {
        const gatewayUrl = process.env.GATEWAY_URL || request.nextUrl.origin;
        return NextResponse.json({
          status: "approved",
          appId: grant.appId,
          grantId: grant.id,
          gatewayUrl,
        });
      }

      case "DENIED":
        return NextResponse.json({
          status: "rejected",
          reason: "Connection was denied by the gateway owner",
        });

      case "EXPIRED":
        return NextResponse.json({
          status: "expired",
        });

      default:
        // Suspended/revoked grants were approved once; report their state
        return NextResponse.json({
          status: grant.status.toLowerCase(),
        });
    }
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 }
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
