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
    const grantRequests = (requestedPermissions || []).map(
      (perm: { resourceId: string; actions: string[] }) => ({
        resource: perm.resourceId,
        actions: perm.actions,
        reason: "Demo playground request from the reference app.",
      }),
    );

    // Access options are REQUIRED: the app proposes presets and the
    // owner picks one on the approval screen. The demo offers a full
    // preset, plus a trimmed one when more than one resource is asked for.
    const grantOptions = [
      {
        id: "standard",
        name: "Standard access",
        description: "Everything the demo playground asks for.",
        recommended: true,
        requests: grantRequests.map((_: unknown, i: number) => i),
        budget: { dailyRequests: 100 },
      },
      ...(grantRequests.length > 1
        ? [
            {
              id: "minimal",
              name: "Minimal",
              description: "Just the first resource, with a tighter budget.",
              requests: [0],
              budget: { dailyRequests: 25 },
            },
          ]
        : []),
    ];

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
        requests: grantRequests,
        options: grantOptions,
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
