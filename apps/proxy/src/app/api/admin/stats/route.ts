import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/lib/admin-auth";

// ============================================
// GET /api/admin/stats
// Overview aggregates: requests today, est. spend, active grants,
// top apps (7d), recent activity, pending grants.
// ============================================

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    requestsToday,
    spendToday,
    spendMonth,
    activeGrants,
    pendingGrants,
    topAppsRaw,
    recent,
  ] = await Promise.all([
    prisma.requestLog.count({ where: { timestamp: { gte: dayStart } } }),
    prisma.requestLog.aggregate({
      where: { timestamp: { gte: dayStart } },
      _sum: { costEstimate: true },
    }),
    prisma.requestLog.aggregate({
      where: {
        timestamp: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _sum: { costEstimate: true },
    }),
    prisma.grant.count({ where: { status: "ACTIVE" } }),
    prisma.grant.count({ where: { status: "PENDING" } }),
    prisma.requestLog.groupBy({
      by: ["appId"],
      where: { timestamp: { gte: weekAgo }, appId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { appId: "desc" } },
      take: 5,
    }),
    prisma.requestLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 10,
      select: {
        id: true,
        resourceId: true,
        action: true,
        decision: true,
        latencyMs: true,
        timestamp: true,
        app: { select: { name: true } },
      },
    }),
  ]);

  const appIds = topAppsRaw.map((row) => row.appId!).filter(Boolean);
  const apps = await prisma.app.findMany({
    where: { id: { in: appIds } },
    select: { id: true, name: true },
  });
  const appNames = new Map(apps.map((app) => [app.id, app.name]));

  return NextResponse.json({
    requestsToday,
    estSpendToday: spendToday._sum.costEstimate ?? 0,
    estSpend30d: spendMonth._sum.costEstimate ?? 0,
    activeGrants,
    pendingGrants,
    topApps: topAppsRaw.map((row) => ({
      appId: row.appId,
      name: appNames.get(row.appId!) ?? "(deleted app)",
      requests: row._count._all,
    })),
    recentActivity: recent,
  });
}
