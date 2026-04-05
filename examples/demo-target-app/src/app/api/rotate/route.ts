// ============================================
// POST /api/rotate
// Rotate gateway credential
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { verifyConnectionHandle, createConnectionHandle } from "@/lib/handle.server";
import {
  createGatewayFetch,
  loadSeedFromEnv,
  publicKeyFromSeed,
  base64UrlEncode,
} from "@glueco/sdk";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { handle } = body;

    if (!handle) {
      return NextResponse.json(
        { error: "handle is required" },
        { status: 400 }
      );
    }

    // Verify current connection handle
    const handlePayload = verifyConnectionHandle(handle);
    if (!handlePayload) {
      return NextResponse.json(
        { error: "Invalid or expired connection handle" },
        { status: 401 }
      );
    }

    const { gatewayUrl, appId } = handlePayload;

    // Load current seed from env
    let currentSeed: Uint8Array;
    try {
      currentSeed = loadSeedFromEnv();
    } catch {
      return NextResponse.json(
        { error: "GLUECO_PRIVATE_KEY not configured" },
        { status: 500 }
      );
    }

    // Check for next private key (for rotation)
    const nextPrivateKey = process.env.GLUECO_NEXT_PRIVATE_KEY;
    if (!nextPrivateKey) {
      return NextResponse.json(
        { error: "GLUECO_NEXT_PRIVATE_KEY not configured. Set the new private key before rotating." },
        { status: 400 }
      );
    }

    // Derive new public key
    let nextSeed: Uint8Array;
    try {
      nextSeed = Uint8Array.from(Buffer.from(nextPrivateKey, "base64"));
      if (nextSeed.length !== 32) {
        throw new Error("Invalid seed length");
      }
    } catch {
      return NextResponse.json(
        { error: "GLUECO_NEXT_PRIVATE_KEY must be valid base64-encoded 32 bytes" },
        { status: 400 }
      );
    }

    const newPublicKey = publicKeyFromSeed(nextSeed);

    // Create gateway fetch with CURRENT seed (uses GLUECO_PRIVATE_KEY from env)
    const gatewayFetch = createGatewayFetch({
      appId,
      proxyUrl: gatewayUrl,
      // seed is loaded from env automatically
    });

    // Call proxy rotate endpoint
    const response = await gatewayFetch(`${gatewayUrl}/api/connect/rotate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ newPublicKey }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorBody?.error?.message || errorBody?.error || "Failed to rotate" },
        { status: response.status }
      );
    }

    // Create new connection handle (same gatewayUrl/appId, fresh expiry)
    const newHandle = createConnectionHandle(gatewayUrl, appId);

    return NextResponse.json({
      status: "rotated",
      newHandle,
      message: "Key rotated successfully. Update GLUECO_PRIVATE_KEY to the new key.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Rotate error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
