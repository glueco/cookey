import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/lib/admin-auth";

// ============================================
// /api/admin/grants
// GET — list grants with token + app summary
//
// There is deliberately NO POST here: grants only arrive from the app
// itself — via /api/connect/prepare (pairing code) or the app's
// published /.well-known/cookey-grant.json (/api/admin/grants/fetch).
// Owners choose among the app's proposed access options at approval;
// they never author grant documents by hand.
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

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Manual grant creation was removed — apps submit their own grant documents via /api/connect/prepare (pairing code) or publish /.well-known/cookey-grant.json for URL-based discovery",
    },
    { status: 410 },
  );
}
