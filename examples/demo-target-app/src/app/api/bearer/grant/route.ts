import { NextRequest, NextResponse } from "next/server";

// ============================================
// GET /api/bearer/grant
// Server-side relay of the gateway's /v1/grant — the bearer token never
// leaves the server-to-gateway leg (browsers are blocked by the origin
// gate, which is the correct default).
// Headers: x-gateway-url, x-gateway-token.
// ============================================

export async function GET(request: NextRequest) {
  const gatewayUrl = request.headers.get("x-gateway-url");
  const token = request.headers.get("x-gateway-token");

  if (!gatewayUrl || !token) {
    return NextResponse.json(
      { error: "x-gateway-url and x-gateway-token headers required" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/v1/grant`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Could not reach gateway: ${error instanceof Error ? error.message : "unknown"}`,
      },
      { status: 502 },
    );
  }
}
