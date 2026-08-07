import { describe, it, expect, beforeAll } from "vitest";

// ============================================
// INTEGRATION TESTS — Postgres-backed limits
// Require a reachable DATABASE_URL; skipped otherwise so the suite
// stays green in environments without a database.
// ============================================

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("Postgres-backed limits", () => {
  let nonce: typeof import("../nonce");
  let rateLimit: typeof import("../rate-limit");
  let budget: typeof import("../budget");
  let prisma: typeof import("@/lib/db").prisma;
  let permissionId: string;
  let grantId: string;

  beforeAll(async () => {
    nonce = await import("../nonce");
    rateLimit = await import("../rate-limit");
    budget = await import("../budget");
    prisma = (await import("@/lib/db")).prisma;

    // A permission (owned by a grant) to hang usage counters off
    const app = await prisma.app.create({
      data: { name: `limits-test-${Date.now()}` },
    });
    const grant = await prisma.grant.create({
      data: {
        appId: app.id,
        document: { app: { name: app.name } },
        status: "ACTIVE",
        authType: "BEARER",
        runtime: "server",
      },
    });
    const permission = await prisma.resourcePermission.create({
      data: {
        appId: app.id,
        grantId: grant.id,
        resourceId: "llm:testprov",
        action: "chat.completions",
        dailyQuota: 3,
        dailyTokenBudget: 100,
      },
    });
    permissionId = permission.id;
    grantId = grant.id;

    return async () => {
      await prisma.app.delete({ where: { id: app.id } });
    };
  });

  it("nonce: first use passes, replay is rejected", async () => {
    const value = `test-nonce-${Date.now()}-${Math.random()}`;
    expect(await nonce.checkAndSetNonce(value)).toBe(true);
    expect(await nonce.checkAndSetNonce(value)).toBe(false);
  });

  it("rate limit: counts within a fixed window and denies past max", async () => {
    const key = `test-rl-${Date.now()}`;
    const first = await rateLimit.checkRateLimit(key, 2, 3600);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);

    const second = await rateLimit.checkRateLimit(key, 2, 3600);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);

    const third = await rateLimit.checkRateLimit(key, 2, 3600);
    expect(third.allowed).toBe(false);
  });

  it("budget: request counts increment at admission and deny over quota", async () => {
    for (let i = 1; i <= 3; i++) {
      const result = await budget.checkAndIncrementRequestUsage(
        permissionId,
        grantId,
        { dailyQuota: 3 },
      );
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(i);
    }

    const over = await budget.checkAndIncrementRequestUsage(
      permissionId,
      grantId,
      { dailyQuota: 3 },
    );
    expect(over.allowed).toBe(false);
    expect(over.used).toBe(4);
  });

  it("budget: token budget denies only once usage reaches the cap", async () => {
    const before = await budget.checkTokenBudget(grantId, {
      dailyTokenBudget: 100,
    });
    expect(before.allowed).toBe(true);

    await budget.recordTokenUsage(permissionId, 100);

    const after = await budget.checkTokenBudget(grantId, {
      dailyTokenBudget: 100,
    });
    expect(after.allowed).toBe(false);
    expect(after.used).toBe(100);
  });

  it("budget: usage snapshot reflects both counters", async () => {
    const snapshot = await budget.getUsageSnapshot(permissionId);
    expect(snapshot.dailyRequests).toBeGreaterThanOrEqual(4);
    expect(snapshot.dailyTokens).toBe(100);
    expect(snapshot.monthlyTokens).toBe(100);
  });
});
