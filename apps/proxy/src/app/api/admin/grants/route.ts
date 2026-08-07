import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/lib/admin-auth";
import { createPendingGrant, GrantServiceError } from "@/server/grants/service";

// ============================================
// /api/admin/grants
// GET  — list grants with token + app summary
// POST — create a PENDING grant from a pasted document (5.2 path 3)
// ============================================

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status");

  const grants = await prisma.grant.findMany({
    where: status ? { status: status as never } : undefined,
    include: {
      app: { select: { id: true, name: true, description: true } },
      tokens: {
        select: {
          id: true,
          displayPrefix: true,
          expiresAt: true,
          revokedAt: true,
          firstUsedAt: true,
          lastUsedAt: true,
          lastUsedIp: true,
        },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { permissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ grants });
}

const PasteGrantSchema = z.object({
  document: z.record(z.unknown()),
});

export async function POST(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PasteGrantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { document: <grant document> }" },
      { status: 400 },
    );
  }

  try {
    const grant = await createPendingGrant(parsed.data.document);
    return NextResponse.json({
      grant,
      approvalUrl: `${process.env.GATEWAY_URL || request.nextUrl.origin}/connect/approve?grant=${grant.id}`,
    });
  } catch (error) {
    if (error instanceof GrantServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Grant paste error:", error);
    return NextResponse.json(
      { error: "Failed to create grant" },
      { status: 500 },
    );
  }
}
