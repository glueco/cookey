import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authenticateRequest, getAuthErrorStatus } from "@/server/auth/pop";
import { createErrorResponse, ErrorCode } from "@/shared";
import { CORS_PREFLIGHT_HEADERS } from "@/lib/cors";

// ============================================
// POST /api/connect/rotate
// Rotate app credential (PoP-authenticated)
// ============================================

const RotateRequestSchema = z.object({
  newPublicKey: z.string().min(1, "newPublicKey is required"),
});

export async function POST(request: NextRequest) {
  let body: string;

  try {
    body = await request.text();
  } catch {
    return NextResponse.json(
      createErrorResponse(ErrorCode.ERR_INVALID_JSON, "Failed to read body"),
      { status: 400 }
    );
  }

  // Authenticate with PoP (uses current credential)
  const auth = await authenticateRequest(request, body);
  if (!auth.success) {
    return NextResponse.json(
      createErrorResponse(auth.errorCode!, auth.error!),
      { status: getAuthErrorStatus(auth.errorCode!) }
    );
  }

  // Parse and validate body
  let parsed: z.infer<typeof RotateRequestSchema>;
  try {
    const json = JSON.parse(body);
    const result = RotateRequestSchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        createErrorResponse(ErrorCode.ERR_INVALID_REQUEST, "Invalid request", {
          details: result.error.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        }),
        { status: 400 }
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json(
      createErrorResponse(ErrorCode.ERR_INVALID_JSON, "Invalid JSON body"),
      { status: 400 }
    );
  }

  try {
    const appId = auth.appId!;
    const { newPublicKey } = parsed;

    // Find current active credential
    const currentCredential = await prisma.appCredential.findFirst({
      where: {
        appId,
        status: "ACTIVE",
      },
    });

    if (!currentCredential) {
      return NextResponse.json(
        createErrorResponse(ErrorCode.ERR_APP_NOT_FOUND, "No active credential found"),
        { status: 404 }
      );
    }

    // Perform rotation in transaction
    await prisma.$transaction([
      // Deactivate current credential
      prisma.appCredential.update({
        where: { id: currentCredential.id },
        data: { status: "REVOKED" },
      }),

      // Create new credential with new public key
      // Note: usage limits are not copied - they stay with ResourcePermission
      prisma.appCredential.create({
        data: {
          appId,
          publicKey: newPublicKey,
          label: "rotated",
          status: "ACTIVE",
        },
      }),
    ]);

    return NextResponse.json({
      status: "rotated",
    });
  } catch (error) {
    console.error("Rotation error:", error);
    return NextResponse.json(
      createErrorResponse(ErrorCode.ERR_INTERNAL, "Failed to rotate credential"),
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
