import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { UsagePeriodType } from "@prisma/client";

// ============================================
// BUDGET TRACKING (Daily/Monthly Quotas)
// Postgres-backed PermissionUsage counters.
//
// Semantics preserved from the former Redis implementation:
// - Request counts increment at admission (a denied-over-quota request
//   still consumed its increment), allowed = used <= limit.
// - Token counts are checked before the upstream call (check-only) and
//   incremented only after upstream success.
// ============================================

export interface BudgetResult {
  allowed: boolean;
  used: number;
  limit: number;
  periodEnd: number; // Unix timestamp
}

/** Start of the current UTC day. */
export function dailyPeriodStart(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Start of the current UTC month. */
export function monthlyPeriodStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function periodEndUnix(periodType: UsagePeriodType, now: Date): number {
  if (periodType === "DAILY") {
    const tomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    return Math.floor(tomorrow.getTime() / 1000);
  }
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return Math.floor(nextMonth.getTime() / 1000);
}

/**
 * Atomically increment a permission's usage counter and return the row.
 * Upsert races (P2002) are retried once — second attempt takes the update path.
 */
async function incrementUsage(
  permissionId: string,
  periodType: UsagePeriodType,
  periodStart: Date,
  data: { requests?: number; tokens?: number },
  retried = false,
): Promise<{ requestCount: number; tokenCount: number }> {
  try {
    return await prisma.permissionUsage.upsert({
      where: {
        permissionId_periodType_periodStart: {
          permissionId,
          periodType,
          periodStart,
        },
      },
      create: {
        permissionId,
        periodType,
        periodStart,
        requestCount: data.requests ?? 0,
        tokenCount: data.tokens ?? 0,
      },
      update: {
        ...(data.requests && { requestCount: { increment: data.requests } }),
        ...(data.tokens && { tokenCount: { increment: data.tokens } }),
      },
      select: { requestCount: true, tokenCount: true },
    });
  } catch (error) {
    if (
      !retried &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return incrementUsage(permissionId, periodType, periodStart, data, true);
    }
    throw error;
  }
}

/**
 * Increment request counters (daily + monthly) at admission and check quotas.
 * Returns the first violated quota, or the daily result when allowed.
 */
export async function checkAndIncrementRequestUsage(
  permissionId: string,
  quotas: { dailyQuota?: number | null; monthlyQuota?: number | null },
): Promise<BudgetResult & { period: UsagePeriodType }> {
  const now = new Date();

  const [daily, monthly] = await Promise.all([
    incrementUsage(permissionId, "DAILY", dailyPeriodStart(now), {
      requests: 1,
    }),
    incrementUsage(permissionId, "MONTHLY", monthlyPeriodStart(now), {
      requests: 1,
    }),
  ]);

  if (quotas.dailyQuota && daily.requestCount > quotas.dailyQuota) {
    return {
      allowed: false,
      used: daily.requestCount,
      limit: quotas.dailyQuota,
      periodEnd: periodEndUnix("DAILY", now),
      period: "DAILY",
    };
  }

  if (quotas.monthlyQuota && monthly.requestCount > quotas.monthlyQuota) {
    return {
      allowed: false,
      used: monthly.requestCount,
      limit: quotas.monthlyQuota,
      periodEnd: periodEndUnix("MONTHLY", now),
      period: "MONTHLY",
    };
  }

  return {
    allowed: true,
    used: daily.requestCount,
    limit: quotas.dailyQuota ?? 0,
    periodEnd: periodEndUnix("DAILY", now),
    period: "DAILY",
  };
}

/**
 * Check token budgets without incrementing (tokens are only counted after
 * upstream success). Deny when current usage has already reached the budget.
 */
export async function checkTokenBudget(
  permissionId: string,
  budgets: {
    dailyTokenBudget?: number | null;
    monthlyTokenBudget?: number | null;
  },
): Promise<BudgetResult & { period: UsagePeriodType }> {
  const now = new Date();

  if (!budgets.dailyTokenBudget && !budgets.monthlyTokenBudget) {
    return {
      allowed: true,
      used: 0,
      limit: 0,
      periodEnd: periodEndUnix("DAILY", now),
      period: "DAILY",
    };
  }

  const usage = await prisma.permissionUsage.findMany({
    where: {
      permissionId,
      OR: [
        { periodType: "DAILY", periodStart: dailyPeriodStart(now) },
        { periodType: "MONTHLY", periodStart: monthlyPeriodStart(now) },
      ],
    },
    select: { periodType: true, tokenCount: true },
  });

  const dailyUsed =
    usage.find((u) => u.periodType === "DAILY")?.tokenCount ?? 0;
  const monthlyUsed =
    usage.find((u) => u.periodType === "MONTHLY")?.tokenCount ?? 0;

  if (budgets.dailyTokenBudget && dailyUsed >= budgets.dailyTokenBudget) {
    return {
      allowed: false,
      used: dailyUsed,
      limit: budgets.dailyTokenBudget,
      periodEnd: periodEndUnix("DAILY", now),
      period: "DAILY",
    };
  }

  if (budgets.monthlyTokenBudget && monthlyUsed >= budgets.monthlyTokenBudget) {
    return {
      allowed: false,
      used: monthlyUsed,
      limit: budgets.monthlyTokenBudget,
      periodEnd: periodEndUnix("MONTHLY", now),
      period: "MONTHLY",
    };
  }

  return {
    allowed: true,
    used: dailyUsed,
    limit: budgets.dailyTokenBudget ?? 0,
    periodEnd: periodEndUnix("DAILY", now),
    period: "DAILY",
  };
}

/**
 * Record token usage after a successful upstream call (daily + monthly).
 */
export async function recordTokenUsage(
  permissionId: string,
  tokens: number,
): Promise<void> {
  if (tokens <= 0) return;
  const now = new Date();
  await Promise.all([
    incrementUsage(permissionId, "DAILY", dailyPeriodStart(now), { tokens }),
    incrementUsage(permissionId, "MONTHLY", monthlyPeriodStart(now), {
      tokens,
    }),
  ]);
}

/**
 * Current-period usage snapshot for a permission (drives /v1/grant remaining).
 */
export async function getUsageSnapshot(permissionId: string): Promise<{
  dailyRequests: number;
  monthlyRequests: number;
  dailyTokens: number;
  monthlyTokens: number;
}> {
  const now = new Date();
  const usage = await prisma.permissionUsage.findMany({
    where: {
      permissionId,
      OR: [
        { periodType: "DAILY", periodStart: dailyPeriodStart(now) },
        { periodType: "MONTHLY", periodStart: monthlyPeriodStart(now) },
      ],
    },
    select: { periodType: true, requestCount: true, tokenCount: true },
  });

  const daily = usage.find((u) => u.periodType === "DAILY");
  const monthly = usage.find((u) => u.periodType === "MONTHLY");

  return {
    dailyRequests: daily?.requestCount ?? 0,
    monthlyRequests: monthly?.requestCount ?? 0,
    dailyTokens: daily?.tokenCount ?? 0,
    monthlyTokens: monthly?.tokenCount ?? 0,
  };
}
