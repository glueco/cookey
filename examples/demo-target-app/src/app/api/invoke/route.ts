// ============================================
// POST /api/invoke
// Execute integration request via gateway
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { verifyConnectionHandle } from "@/lib/handle.server";
import { createServerTransport } from "@/lib/gateway.server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { handle, resourceId, action, payload } = body;

    if (!handle) {
      return NextResponse.json(
        { error: "handle is required" },
        { status: 400 }
      );
    }

    if (!resourceId || !action) {
      return NextResponse.json(
        { error: "resourceId and action are required" },
        { status: 400 }
      );
    }

    // Verify connection handle
    const handlePayload = verifyConnectionHandle(handle);
    if (!handlePayload) {
      return NextResponse.json(
        { error: "Invalid or expired connection handle" },
        { status: 401 }
      );
    }

    const { gatewayUrl, appId } = handlePayload;

    // Create server-side transport
    const transport = createServerTransport(gatewayUrl, appId);

    // Raw PoP transport — the gateway speaks the canonical wire shape
    // for every provider, so no per-provider client code is needed
    const result = await transport.request(resourceId, action, payload);

    return NextResponse.json({
      data: result.data,
      status: result.status,
      headers: result.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Invoke error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
