import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ============================================
// USAGE STATISTICS
// SQL aggregations over RequestLog — replaces the former Redis
// model-usage counters. Token counts come from the usage metadata the
// pipeline writes on ALLOWED requests.
// ============================================

export interface ModelUsageStats {
  model: string;
  requestCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
}

export interface DailyModelUsage {
  resourceId: string;
  date: string;
  models: ModelUsageStats[];
}

interface UsageRow {
  resourceId: string;
  date: string;
  model: string | null;
  requestCount: bigint;
  inputTokens: bigint | null;
  outputTokens: bigint | null;
  totalTokens: bigint | null;
}

/**
 * Count of allowed requests for an app since UTC midnight.
 */
export async function getDailyRequestCount(appId: string): Promise<number> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  return prisma.requestLog.count({
    where: { appId, timestamp: { gte: dayStart } },
  });
}

/**
 * Per-day, per-resource, per-model usage for an app over the trailing N days.
 */
export async function getModelUsageByDay(
  appId: string,
  days = 7,
): Promise<DailyModelUsage[]> {
  const rows = await prisma.$queryRaw<UsageRow[]>(Prisma.sql`
    SELECT
      "resourceId",
      to_char("timestamp" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "date",
      "metadata"->>'model' AS "model",
      COUNT(*) AS "requestCount",
      SUM(COALESCE(("metadata"->>'inputTokens')::bigint, 0)) AS "inputTokens",
      SUM(COALESCE(("metadata"->>'outputTokens')::bigint, 0)) AS "outputTokens",
      SUM(COALESCE(("metadata"->>'totalTokens')::bigint, 0)) AS "totalTokens"
    FROM "RequestLog"
    WHERE "appId" = ${appId}
      AND "decision" = 'ALLOWED'
      AND "timestamp" >= NOW() - (${days} || ' days')::interval
    GROUP BY 1, 2, 3
    ORDER BY 2 DESC
  `);

  const byKey = new Map<string, DailyModelUsage>();
  for (const row of rows) {
    const key = `${row.resourceId}:${row.date}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { resourceId: row.resourceId, date: row.date, models: [] };
      byKey.set(key, entry);
    }
    entry.models.push({
      model: row.model ?? "(unknown)",
      requestCount: Number(row.requestCount),
      inputTokens: Number(row.inputTokens ?? 0),
      outputTokens: Number(row.outputTokens ?? 0),
      totalTokens: Number(row.totalTokens ?? 0),
    });
  }
  return [...byKey.values()];
}

/**
 * Summarize daily usage entries into app-level totals and a per-model breakdown.
 */
export function summarizeUsage(usageStats: DailyModelUsage[]): {
  totalRequests: number;
  totalTokens: number;
  modelBreakdown: ModelUsageStats[];
} {
  const byModel = new Map<string, ModelUsageStats>();
  let totalRequests = 0;
  let totalTokens = 0;

  for (const day of usageStats) {
    for (const m of day.models) {
      totalRequests += m.requestCount;
      totalTokens += m.totalTokens;
      const existing = byModel.get(m.model);
      if (existing) {
        existing.requestCount += m.requestCount;
        existing.totalTokens += m.totalTokens;
        existing.inputTokens += m.inputTokens;
        existing.outputTokens += m.outputTokens;
      } else {
        byModel.set(m.model, { ...m });
      }
    }
  }

  return {
    totalRequests,
    totalTokens,
    modelBreakdown: [...byModel.values()].sort(
      (a, b) => b.requestCount - a.requestCount,
    ),
  };
}
