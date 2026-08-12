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
//
// Budgets come from the GRANT (decisions.budget) and are denormalized
// onto every permission row, so enforcement aggregates usage across ALL
// of a grant's permissions — otherwise a wildcard bound to N connectors
// × M actions would multiply the owner-approved ceiling by N×M.
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
  data: { requests?: number; tokens?: number; costUsd?: number },
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
        costUsd: data.costUsd ?? 0,
      },
      update: {
        ...(data.requests && { requestCount: { increment: data.requests } }),
        ...(data.tokens && { tokenCount: { increment: data.tokens } }),
        ...(data.costUsd && { costUsd: { increment: data.costUsd } }),
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
 * Sum usage counters for a period across every permission of a grant.
 */
async function grantPeriodUsage(
  grantId: string,
  periodType: UsagePeriodType,
  periodStart: Date,
): Promise<{ requests: number; tokens: number; costUsd: number }> {
  const totals = await prisma.permissionUsage.aggregate({
    where: { permission: { grantId }, periodType, periodStart },
    _sum: { requestCount: true, tokenCount: true, costUsd: true },
  });
  return {
    requests: totals._sum.requestCount ?? 0,
    tokens: totals._sum.tokenCount ?? 0,
    costUsd: totals._sum.costUsd ?? 0,
  };
}

/**
 * Increment request counters (daily + monthly) at admission and check quotas
 * against the GRANT-WIDE totals. Returns the first violated quota, or the
 * daily result when allowed.
 */
export async function checkAndIncrementRequestUsage(
  permissionId: string,
  grantId: string,
  quotas: { dailyQuota?: number | null; monthlyQuota?: number | null },
): Promise<BudgetResult & { period: UsagePeriodType }> {
  const now = new Date();

  await Promise.all([
    incrementUsage(permissionId, "DAILY", dailyPeriodStart(now), {
      requests: 1,
    }),
    incrementUsage(permissionId, "MONTHLY", monthlyPeriodStart(now), {
      requests: 1,
    }),
  ]);

  const [daily, monthly] = await Promise.all([
    grantPeriodUsage(grantId, "DAILY", dailyPeriodStart(now)),
    grantPeriodUsage(grantId, "MONTHLY", monthlyPeriodStart(now)),
  ]);

  if (quotas.dailyQuota && daily.requests > quotas.dailyQuota) {
    return {
      allowed: false,
      used: daily.requests,
      limit: quotas.dailyQuota,
      periodEnd: periodEndUnix("DAILY", now),
      period: "DAILY",
    };
  }

  if (quotas.monthlyQuota && monthly.requests > quotas.monthlyQuota) {
    return {
      allowed: false,
      used: monthly.requests,
      limit: quotas.monthlyQuota,
      periodEnd: periodEndUnix("MONTHLY", now),
      period: "MONTHLY",
    };
  }

  return {
    allowed: true,
    used: daily.requests,
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
  grantId: string,
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

  const [daily, monthly] = await Promise.all([
    grantPeriodUsage(grantId, "DAILY", dailyPeriodStart(now)),
    grantPeriodUsage(grantId, "MONTHLY", monthlyPeriodStart(now)),
  ]);
  const dailyUsed = daily.tokens;
  const monthlyUsed = monthly.tokens;

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
 * Check spend budgets without incrementing — same shape as the token
 * check: cost is only known after the upstream call, so admission
 * denies once the accumulated estimate has reached the cap.
 */
export async function checkCostBudget(
  grantId: string,
  budgets: {
    dailyCostBudgetUsd?: number | null;
    monthlyCostBudgetUsd?: number | null;
  },
): Promise<BudgetResult & { period: UsagePeriodType }> {
  const now = new Date();

  if (!budgets.dailyCostBudgetUsd && !budgets.monthlyCostBudgetUsd) {
    return {
      allowed: true,
      used: 0,
      limit: 0,
      periodEnd: periodEndUnix("DAILY", now),
      period: "DAILY",
    };
  }

  const [daily, monthly] = await Promise.all([
    grantPeriodUsage(grantId, "DAILY", dailyPeriodStart(now)),
    grantPeriodUsage(grantId, "MONTHLY", monthlyPeriodStart(now)),
  ]);

  if (
    budgets.dailyCostBudgetUsd &&
    daily.costUsd >= budgets.dailyCostBudgetUsd
  ) {
    return {
      allowed: false,
      used: daily.costUsd,
      limit: budgets.dailyCostBudgetUsd,
      periodEnd: periodEndUnix("DAILY", now),
      period: "DAILY",
    };
  }

  if (
    budgets.monthlyCostBudgetUsd &&
    monthly.costUsd >= budgets.monthlyCostBudgetUsd
  ) {
    return {
      allowed: false,
      used: monthly.costUsd,
      limit: budgets.monthlyCostBudgetUsd,
      periodEnd: periodEndUnix("MONTHLY", now),
      period: "MONTHLY",
    };
  }

  return {
    allowed: true,
    used: daily.costUsd,
    limit: budgets.dailyCostBudgetUsd ?? 0,
    periodEnd: periodEndUnix("DAILY", now),
    period: "DAILY",
  };
}

/**
 * Record token + estimated cost usage after a successful upstream call
 * (daily + monthly).
 */
export async function recordTokenUsage(
  permissionId: string,
  tokens: number,
  costUsd = 0,
): Promise<void> {
  if (tokens <= 0 && costUsd <= 0) return;
  const now = new Date();
  const data = {
    ...(tokens > 0 && { tokens }),
    ...(costUsd > 0 && { costUsd }),
  };
  await Promise.all([
    incrementUsage(permissionId, "DAILY", dailyPeriodStart(now), data),
    incrementUsage(permissionId, "MONTHLY", monthlyPeriodStart(now), data),
  ]);
}

/**
 * Current-period usage snapshot for a permission (per-permission view,
 * used by the admin grant-detail usage bars).
 */
export async function getUsageSnapshot(permissionId: string): Promise<{
  dailyRequests: number;
  monthlyRequests: number;
  dailyTokens: number;
  monthlyTokens: number;
  dailyCostUsd: number;
  monthlyCostUsd: number;
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
    select: {
      periodType: true,
      requestCount: true,
      tokenCount: true,
      costUsd: true,
    },
  });

  const daily = usage.find((u) => u.periodType === "DAILY");
  const monthly = usage.find((u) => u.periodType === "MONTHLY");

  return {
    dailyRequests: daily?.requestCount ?? 0,
    monthlyRequests: monthly?.requestCount ?? 0,
    dailyTokens: daily?.tokenCount ?? 0,
    monthlyTokens: monthly?.tokenCount ?? 0,
    dailyCostUsd: daily?.costUsd ?? 0,
    monthlyCostUsd: monthly?.costUsd ?? 0,
  };
}

/**
 * Grant-wide current-period usage snapshot (drives /v1/grant remaining —
 * budgets are grant-level, so remaining must be too).
 */
export async function getGrantUsageSnapshot(grantId: string): Promise<{
  dailyRequests: number;
  monthlyRequests: number;
  dailyTokens: number;
  monthlyTokens: number;
  dailyCostUsd: number;
  monthlyCostUsd: number;
}> {
  const now = new Date();
  const [daily, monthly] = await Promise.all([
    grantPeriodUsage(grantId, "DAILY", dailyPeriodStart(now)),
    grantPeriodUsage(grantId, "MONTHLY", monthlyPeriodStart(now)),
  ]);
  return {
    dailyRequests: daily.requests,
    monthlyRequests: monthly.requests,
    dailyTokens: daily.tokens,
    monthlyTokens: monthly.tokens,
    dailyCostUsd: daily.costUsd,
    monthlyCostUsd: monthly.costUsd,
  };
}
