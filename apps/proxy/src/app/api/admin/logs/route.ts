import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { checkAdminAuth } from "@/lib/admin-auth";

// ============================================
// GET /api/admin/logs
// RequestLog with filters: ?grantId= &connectorId= &decision= &since= &until= &page=
// ============================================

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const where: Prisma.RequestLogWhereInput = {};

  const grantId = params.get("grantId");
  if (grantId) where.grantId = grantId;
  const connectorId = params.get("connectorId");
  if (connectorId) where.resourceId = connectorId;
  const decision = params.get("decision");
  if (decision) where.decision = decision as never;
  const since = params.get("since");
  const until = params.get("until");
  if (since || until) {
    where.timestamp = {
      ...(since && { gte: new Date(since) }),
      ...(until && { lte: new Date(until) }),
    };
  }

  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));

  const [logs, total] = await Promise.all([
    prisma.requestLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { app: { select: { name: true } } },
    }),
    prisma.requestLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    pageSize: PAGE_SIZE,
  });
}
