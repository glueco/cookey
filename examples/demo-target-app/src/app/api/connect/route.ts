// ============================================
// POST /api/connect
// Initiate connection to a gateway
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { parsePairingString } from "@glueco/sdk";
import { getPublicKey } from "@/lib/gateway.server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pairingString, app, requestedPermissions, redirectUri } = body;

    if (!pairingString) {
      return NextResponse.json(
        { error: "pairingString is required" },
        { status: 400 }
      );
    }

    // Use SDK helper to parse pairing string
    const { proxyUrl, connectCode } = parsePairingString(pairingString);

    // Get public key from server-side private key
    const publicKey = await getPublicKey();

    // Build the grant document (docs/GRANT_SPEC.md) for the gateway
    const preparePayload = {
      connectCode,
      grant: {
        specVersion: "1",
        app: app || {
          name: "Demo Target App",
          description: "Reference implementation for Cookey integration",
        },
        runtime: "server",
        auth: "pop",
        publicKey,
        requests: (requestedPermissions || []).map(
          (perm: { resourceId: string; actions: string[] }) => ({
            resource: perm.resourceId,
            actions: perm.actions,
            reason: "Demo playground request from the reference app.",
          }),
        ),
        duration: "24h",
        budget: { dailyRequests: 100 },
        redirectUri: redirectUri || `${request.nextUrl.origin}/`,
      },
    };

    // Call proxy prepare endpoint
    const response = await fetch(`${proxyUrl}/api/connect/prepare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preparePayload),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: errorBody?.error?.message || errorBody?.error || "Failed to prepare connection",
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      approvalUrl: data.approvalUrl,
      sessionToken: data.sessionToken,
      gatewayUrl: proxyUrl,
      expiresAt: data.expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
