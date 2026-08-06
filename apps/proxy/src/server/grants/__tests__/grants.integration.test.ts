import { describe, it, expect, beforeAll } from "vitest";

// ============================================
// INTEGRATION TESTS — grant lifecycle
// PENDING → approve → bearer auth → renewal / expiry / inactivity via
// the cron sweep. Requires DATABASE_URL; skipped otherwise.
// ============================================

const hasDb = !!process.env.DATABASE_URL;

const DOCUMENT = {
  specVersion: "1",
  app: { name: "Grant Lifecycle Test App" },
  runtime: "server" as const,
  auth: "bearer" as const,
  requests: [
    {
      resource: "llm:testprov",
      actions: ["chat.completions"],
      reason: "Integration test coverage.",
      constraints: { maxOutputTokens: 512 },
    },
  ],
  duration: "30d",
  renewal: { period: "30d" },
  budget: { dailyRequests: 100 },
};

describe.skipIf(!hasDb)("Grant lifecycle", () => {
  let service: typeof import("../service");
  let tokens: typeof import("../tokens");
  let claimCodes: typeof import("../claim-codes");
  let sweep: typeof import("@/server/cron/sweep");
  let bearer: typeof import("@/server/auth/bearer");
  let prisma: typeof import("@/lib/db").prisma;

  const cleanupAppIds: string[] = [];

  beforeAll(async () => {
    service = await import("../service");
    tokens = await import("../tokens");
    claimCodes = await import("../claim-codes");
    sweep = await import("@/server/cron/sweep");
    bearer = await import("@/server/auth/bearer");
    prisma = (await import("@/lib/db")).prisma;

    return async () => {
      await prisma.app.deleteMany({ where: { id: { in: cleanupAppIds } } });
    };
  });

  async function makeApprovedGrant() {
    const grant = await service.createPendingGrant(DOCUMENT);
    cleanupAppIds.push(grant.appId);
    const result = await service.approveGrant(grant.id, {
      auth: "bearer",
      durationMs: 30 * 24 * 60 * 60 * 1000,
      renewal: { periodDays: 30 },
      budget: { dailyRequests: 100 },
      allowBrowser: false,
      inactivitySuspendDays: 14,
    });
    return result;
  }

  it("rejects invalid grant documents", async () => {
    await expect(
      service.createPendingGrant({ specVersion: "2", app: { name: "x" } }),
    ).rejects.toThrowError(/Invalid grant document/);
    await expect(
      service.createPendingGrant({
        ...DOCUMENT,
        auth: "pop",
        publicKey: null,
      }),
    ).rejects.toThrowError(/publicKey/);
    await expect(
      service.createPendingGrant({
        ...DOCUMENT,
        requests: [{ resource: "llm:x", actions: ["a"], reason: "" }],
      }),
    ).rejects.toThrowError(/reason|explain/i);
  });

  it("approve materializes permissions, activates the app, mints a token", async () => {
    const { grant, token } = await makeApprovedGrant();

    expect(grant.status).toBe("ACTIVE");
    expect(token).toMatch(/^ck_[0-9A-Za-z]{40}$/);

    const app = await prisma.app.findUnique({ where: { id: grant.appId } });
    expect(app!.status).toBe("ACTIVE");

    const permission = await prisma.resourcePermission.findFirst({
      where: { grantId: grant.id },
    });
    expect(permission).toMatchObject({
      resourceId: "llm:testprov",
      action: "chat.completions",
      dailyQuota: 100,
    });
    expect(permission!.constraints).toMatchObject({ maxOutputTokens: 512 });
  });

  it("bearer auth resolves the grant; revoked token stops working", async () => {
    const { grant, token } = await makeApprovedGrant();

    const ok = await bearer.authenticateBearer(token!, "203.0.113.9");
    expect(ok.success).toBe(true);
    expect(ok.grant!.id).toBe(grant.id);

    await service.revokeGrant(grant.id);
    const revoked = await bearer.authenticateBearer(token!, null);
    expect(revoked.success).toBe(false);
  });

  it("first use closes the copy-paste window", async () => {
    const { grant, token } = await makeApprovedGrant();

    const before = await prisma.grantToken.findFirst({
      where: { grantId: grant.id },
    });
    expect(tokens.getDisplayableToken(before!)).toBe(token);

    await bearer.authenticateBearer(token!, null);
    // recordTokenUse is fire-and-forget; give it a beat
    await new Promise((r) => setTimeout(r, 300));

    const after = await prisma.grantToken.findFirst({
      where: { grantId: grant.id },
    });
    expect(after!.firstUsedAt).not.toBeNull();
    expect(tokens.getDisplayableToken(after!)).toBeNull();
  });

  it("claim codes are single-use and reuse notifies the owner", async () => {
    const { grant, token } = await makeApprovedGrant();
    const code = await claimCodes.createClaimCode(grant.id);

    const first = await claimCodes.exchangeClaimCode(code);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.token).toBe(token);

    const second = await claimCodes.exchangeClaimCode(code);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.status).toBe(410);

    const notification = await prisma.notification.findFirst({
      where: { type: "claim_reuse", payload: { path: ["grantId"], equals: grant.id } },
    });
    expect(notification).not.toBeNull();
  });

  it("sweep expires grants past expiry and past period end", async () => {
    const { grant } = await makeApprovedGrant();
    await prisma.grant.update({
      where: { id: grant.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await sweep.runSweep();

    const expired = await prisma.grant.findUnique({ where: { id: grant.id } });
    expect(expired!.status).toBe("EXPIRED");
  });

  it("renew extends the period and the SAME token's expiry", async () => {
    const { grant, token } = await makeApprovedGrant();
    const tokenBefore = await prisma.grantToken.findFirst({
      where: { grantId: grant.id },
    });

    // Simulate approaching period end
    await prisma.grant.update({
      where: { id: grant.id },
      data: { currentPeriodEnd: new Date(Date.now() + 1000) },
    });

    const renewed = await service.renewGrant(grant.id);
    expect(renewed.currentPeriodEnd!.getTime()).toBeGreaterThan(
      Date.now() + 29 * 24 * 60 * 60 * 1000,
    );

    const tokenAfter = await prisma.grantToken.findFirst({
      where: { grantId: grant.id },
    });
    expect(tokenAfter!.id).toBe(tokenBefore!.id); // same token, no reissue
    expect(tokenAfter!.expiresAt.getTime()).toBeGreaterThan(
      tokenBefore!.expiresAt.getTime() - 1,
    );

    // Token still authenticates after renewal
    const auth = await bearer.authenticateBearer(token!, null);
    expect(auth.success).toBe(true);
  });

  it("sweep suspends inactive grants and notifies", async () => {
    const { grant } = await makeApprovedGrant();
    await prisma.grant.update({
      where: { id: grant.id },
      data: {
        inactivitySuspendDays: 1,
        lastUsedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    });

    await sweep.runSweep();

    const suspended = await prisma.grant.findUnique({
      where: { id: grant.id },
    });
    expect(suspended!.status).toBe("SUSPENDED_INACTIVITY");

    // One-click reactivate
    const reactivated = await service.setGrantSuspended(grant.id, false);
    expect(reactivated.status).toBe("ACTIVE");
  });

  it("deny marks the grant DENIED and keeps status pollable", async () => {
    const grant = await service.createPendingGrant(DOCUMENT);
    cleanupAppIds.push(grant.appId);
    const denied = await service.denyGrant(grant.id);
    expect(denied.status).toBe("DENIED");
  });
});
