import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ============================================
// RATE LIMITING (Fixed Window)
// Postgres-backed RateCounter upserts.
// Preserves the semantics of the former Redis implementation:
// increment first, then allowed = count <= max.
// ============================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp
}

/**
 * Check rate limit for a given key using a fixed-window counter.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStartSecs = Math.floor(now / windowSeconds) * windowSeconds;
  const windowStart = new Date(windowStartSecs * 1000);

  const count = await incrementCounter(key, windowStart);

  const resetAt = windowStartSecs + windowSeconds;
  const remaining = Math.max(0, maxRequests - count);

  return {
    allowed: count <= maxRequests,
    remaining,
    resetAt,
  };
}

/**
 * Atomically increment a window counter and return the new count.
 * Upsert can race under concurrency (P2002 on simultaneous creates);
 * retry once — the second attempt takes the update path.
 */
async function incrementCounter(
  key: string,
  windowStart: Date,
  retried = false,
): Promise<number> {
  try {
    const row = await prisma.rateCounter.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });
    return row.count;
  } catch (error) {
    if (
      !retried &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return incrementCounter(key, windowStart, true);
    }
    throw error;
  }
}

/**
 * Delete counters from windows old enough to be irrelevant.
 * Called from the cron sweep with the largest plausible window.
 */
export async function cleanupStaleRateCounters(
  olderThanSeconds: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const result = await prisma.rateCounter.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return result.count;
}
