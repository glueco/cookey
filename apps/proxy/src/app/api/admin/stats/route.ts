import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/lib/admin-auth";

// ============================================
// GET /api/admin/stats
// Overview aggregates: requests today, est. spend, active grants,
// top apps (7d), recent activity, pending grants, and a 14-day daily
// series (drives the dashboard sparklines).
// ============================================

const TREND_DAYS = 14;

interface DailyRow {
  day: Date;
  requests: number;
  denied: number;
  spend: number;
}

/**
 * Daily buckets for the trend charts. Aggregated in Postgres rather
 * than by pulling rows into the process — on a busy gateway the raw log
 * for two weeks is far too large to bucket in JS.
 */
async function dailySeries(since: Date): Promise<DailyRow[]> {
  return prisma.$queryRaw<DailyRow[]>`
    SELECT date_trunc('day', "timestamp") AS day,
           COUNT(*)::int AS requests,
           COUNT(*) FILTER (WHERE "decision" <> 'ALLOWED')::int AS denied,
           COALESCE(SUM("costEstimate"), 0)::float AS spend
    FROM "RequestLog"
    WHERE "timestamp" >= ${since}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
}

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const trendStart = new Date(dayStart.getTime() - (TREND_DAYS - 1) * 86_400_000);

  const [
    requestsToday,
    spendToday,
    spendMonth,
    activeGrants,
    pendingGrants,
    topAppsRaw,
    recent,
    deniedToday,
    trendRows,
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
    prisma.requestLog.count({
      where: { timestamp: { gte: dayStart }, decision: { not: "ALLOWED" } },
    }),
    dailySeries(trendStart),
  ]);

  // Gap-fill: a day with no traffic must still appear, or the sparkline
  // would compress a quiet week into a misleading straight line.
  const byDay = new Map(
    trendRows.map((row) => [new Date(row.day).toISOString().slice(0, 10), row]),
  );
  const trend = Array.from({ length: TREND_DAYS }, (_, index) => {
    const date = new Date(trendStart.getTime() + index * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    const row = byDay.get(key);
    return {
      date: key,
      requests: row?.requests ?? 0,
      denied: row?.denied ?? 0,
      spend: row?.spend ?? 0,
    };
  });

  const appIds = topAppsRaw.map((row) => row.appId!).filter(Boolean);
  const apps = await prisma.app.findMany({
    where: { id: { in: appIds } },
    select: { id: true, name: true },
  });
  const appNames = new Map(apps.map((app) => [app.id, app.name]));

  return NextResponse.json({
    requestsToday,
    deniedToday,
    estSpendToday: spendToday._sum.costEstimate ?? 0,
    estSpend30d: spendMonth._sum.costEstimate ?? 0,
    activeGrants,
    pendingGrants,
    trend,
    topApps: topAppsRaw.map((row) => ({
      appId: row.appId,
      name: appNames.get(row.appId!) ?? "(deleted app)",
      requests: row._count._all,
    })),
    recentActivity: recent,
  });
}
