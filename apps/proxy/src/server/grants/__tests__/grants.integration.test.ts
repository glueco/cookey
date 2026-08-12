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
  options: [
    {
      id: "standard",
      name: "Standard",
      recommended: true,
      requests: [0],
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
      optionId: "standard",
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

  it("rejects non-http(s) URLs — the approval screen navigates to redirectUri", async () => {
    await expect(
      service.createPendingGrant({
        ...DOCUMENT,
        redirectUri: "javascript:alert(document.cookie)",
      }),
    ).rejects.toThrowError(/http/i);
    await expect(
      service.createPendingGrant({
        ...DOCUMENT,
        app: { name: "x", homepage: "javascript:alert(1)" },
      }),
    ).rejects.toThrowError(/http/i);
  });

  it("a legacy grant frozen with an unsafe redirectUri falls back to copy-paste delivery", async () => {
    const grant = await service.createPendingGrant(DOCUMENT);
    cleanupAppIds.push(grant.appId);
    // Rows written before the scheme rule carry the document verbatim —
    // simulate one and make sure approval neither navigates nor crashes.
    await prisma.grant.update({
      where: { id: grant.id },
      data: {
        document: {
          ...(grant.document as object),
          redirectUri: "javascript:alert(1)",
        },
      },
    });
    const result = await service.approveGrant(grant.id, {
      optionId: "standard",
      durationMs: 30 * 24 * 60 * 60 * 1000,
      renewal: null,
      allowBrowser: false,
    });
    expect(result.redirectUrl).toBeUndefined();
    expect(result.token).toMatch(/^ck_/);
  });

  it("token verify reports validity WITHOUT counting as first use", async () => {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("@/app/v1/token/verify/route");
    const { grant, token } = await makeApprovedGrant();

    const res = await GET(
      new NextRequest("http://localhost/v1/token/verify", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.grantId).toBe(grant.id);
    expect(body.services).toEqual(["llm:testprov"]);

    // The copy-paste window must survive verification: no firstUsedAt,
    // encrypted copy still present.
    const tokenRow = await prisma.grantToken.findFirstOrThrow({
      where: { grantId: grant.id },
    });
    expect(tokenRow.firstUsedAt).toBeNull();
    expect(tokenRow.encryptedToken).not.toBeNull();

    const bad = await GET(
      new NextRequest("http://localhost/v1/token/verify", {
        headers: { authorization: "Bearer ck_definitely-not-a-token" },
      }),
    );
    expect((await bad.json()).valid).toBe(false);
  });

  it("spend budgets: denormalized onto permissions, deny once the cap is reached", async () => {
    const budgetLimits = await import("@/server/limits/budget");
    const grant = await service.createPendingGrant(DOCUMENT);
    cleanupAppIds.push(grant.appId);
    const { grant: approved } = await service.approveGrant(grant.id, {
      optionId: "standard",
      durationMs: 30 * 24 * 60 * 60 * 1000,
      renewal: null,
      budget: { dailyRequests: 100, dailyCostUsd: 5 },
      allowBrowser: false,
    });

    const permission = await prisma.resourcePermission.findFirstOrThrow({
      where: { grantId: approved.id },
    });
    expect(permission.dailyCostBudgetUsd).toBe(5);

    // Under the cap → allowed; at the cap → denied (check-only, like tokens)
    await budgetLimits.recordTokenUsage(permission.id, 1000, 4.99);
    const under = await budgetLimits.checkCostBudget(approved.id, {
      dailyCostBudgetUsd: permission.dailyCostBudgetUsd,
    });
    expect(under.allowed).toBe(true);

    await budgetLimits.recordTokenUsage(permission.id, 10, 0.01);
    const at = await budgetLimits.checkCostBudget(approved.id, {
      dailyCostBudgetUsd: permission.dailyCostBudgetUsd,
    });
    expect(at.allowed).toBe(false);
    expect(at.used).toBeCloseTo(5);
  });

  it("wildcard bindings cannot cross the requested resource type", async () => {
    const grant = await service.createPendingGrant({
      ...DOCUMENT,
      options: undefined,
      requests: [
        {
          resource: "llm:*",
          actions: ["chat.completions"],
          reason: "Integration test coverage.",
        },
      ],
    });
    cleanupAppIds.push(grant.appId);
    const { grant: approved } = await service.approveGrant(grant.id, {
      bindings: { "0": ["mail:testprov", "llm:testprov"] },
      durationMs: 30 * 24 * 60 * 60 * 1000,
      renewal: null,
      allowBrowser: false,
    });
    const permissions = await prisma.resourcePermission.findMany({
      where: { grantId: approved.id },
    });
    expect(permissions.map((p) => p.resourceId)).toEqual(["llm:testprov"]);
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
    expect(after!.encryptedToken).toBeNull();
    expect(after!.tokenIv).toBeNull();
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

  it("successful claim wipes the encrypted token copy (Addendum A #2)", async () => {
    const { grant, token } = await makeApprovedGrant();
    const code = await claimCodes.createClaimCode(grant.id);

    const before = await prisma.grantToken.findFirst({
      where: { grantId: grant.id },
    });
    expect(tokens.getDisplayableToken(before!)).toBe(token);

    const claimed = await claimCodes.exchangeClaimCode(code);
    expect(claimed.ok).toBe(true);

    const after = await prisma.grantToken.findFirst({
      where: { grantId: grant.id },
    });
    expect(after!.encryptedToken).toBeNull();
    expect(after!.tokenIv).toBeNull();
    expect(tokens.getDisplayableToken(after!)).toBeNull();
    // The token itself keeps working — only the display copy is gone
    const auth = await bearer.authenticateBearer(token!, null);
    expect(auth.success).toBe(true);
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

  it("access options: only the accepted option's requests materialize", async () => {
    const doc = {
      ...DOCUMENT,
      requests: [
        DOCUMENT.requests[0],
        {
          resource: "mail:testmail",
          actions: ["send"],
          reason: "Emails summaries.",
        },
      ],
      options: [
        {
          id: "chat-only",
          name: "Chat only",
          recommended: true,
          requests: [0],
          budget: { dailyRequests: 20 },
        },
        { id: "full", name: "Everything", requests: [0, 1] },
      ],
    };
    const grant = await service.createPendingGrant(doc);
    cleanupAppIds.push(grant.appId);

    const result = await service.approveGrant(grant.id, {
      optionId: "chat-only",
      auth: "bearer",
      durationMs: 7 * 24 * 60 * 60 * 1000,
      renewal: null,
      budget: { dailyRequests: 20 },
      allowBrowser: false,
    });

    const permissions = await prisma.resourcePermission.findMany({
      where: { grantId: result.grant.id },
    });
    expect(permissions).toHaveLength(1);
    expect(permissions[0].resourceId).toBe("llm:testprov");
    expect(permissions[0].dailyQuota).toBe(20);
  });

  it("access options: unknown optionId is rejected before any mutation", async () => {
    const doc = {
      ...DOCUMENT,
      options: [{ id: "basic", name: "Basic", requests: [0] }],
    };
    const grant = await service.createPendingGrant(doc);
    cleanupAppIds.push(grant.appId);
    await expect(
      service.approveGrant(grant.id, {
        optionId: "nope",
        auth: "bearer",
        durationMs: null,
        renewal: null,
        allowBrowser: false,
      }),
    ).rejects.toThrowError(/Unknown access option/);
    const reread = await prisma.grant.findUnique({ where: { id: grant.id } });
    expect(reread?.status).toBe("PENDING");
  });

  it("access options: out-of-range request indexes fail validation", async () => {
    await expect(
      service.createPendingGrant({
        ...DOCUMENT,
        options: [{ id: "bad", name: "Bad", requests: [5] }],
      }),
    ).rejects.toThrowError(/request index 5/);
  });

  it("access options are optional: a document without them is valid", async () => {
    const { options: _omitted, ...withoutOptions } = DOCUMENT;
    const grant = await service.createPendingGrant(withoutOptions);
    cleanupAppIds.push(grant.appId);
    expect(grant.status).toBe("PENDING");
  });

  it("approval without an optionId grants the document's own requests", async () => {
    const doc = {
      ...DOCUMENT,
      requests: [
        DOCUMENT.requests[0],
        {
          resource: "mail:testmail",
          actions: ["send"],
          reason: "Emails summaries.",
        },
      ],
      options: [{ id: "chat-only", name: "Chat only", requests: [0] }],
    };
    const grant = await service.createPendingGrant(doc);
    cleanupAppIds.push(grant.appId);

    // No optionId: the app's full request is what's on the table, even
    // though the app also offered a narrower tier.
    const result = await service.approveGrant(grant.id, {
      durationMs: null,
      renewal: null,
      allowBrowser: false,
    });

    const permissions = await prisma.resourcePermission.findMany({
      where: { grantId: result.grant.id },
    });
    expect(permissions.map((p) => p.resourceId).sort()).toEqual([
      "llm:testprov",
      "mail:testmail",
    ]);
  });

  it("credential type comes from the document, not the approval payload", async () => {
    // The document says bearer and ships no public key, so a payload
    // claiming PoP must not produce a PoP grant.
    const grant = await service.createPendingGrant(DOCUMENT);
    cleanupAppIds.push(grant.appId);

    const result = await service.approveGrant(grant.id, {
      auth: "pop",
      durationMs: null,
      renewal: null,
      allowBrowser: false,
    });

    expect(result.grant.authType).toBe("BEARER");
    expect(result.token).toBeTruthy();
    const credentials = await prisma.appCredential.findMany({
      where: { appId: grant.appId },
    });
    expect(credentials).toHaveLength(0);
  });

  it("a document that ships a signing key gets PoP without being asked", async () => {
    const grant = await service.createPendingGrant({
      ...DOCUMENT,
      auth: "pop",
      publicKey: "A".repeat(44),
    });
    cleanupAppIds.push(grant.appId);

    // Note the absent `auth` in the payload: the screen no longer sends
    // one, and the document alone decides.
    const result = await service.approveGrant(grant.id, {
      durationMs: null,
      renewal: null,
      allowBrowser: false,
    });

    expect(result.grant.authType).toBe("POP");
    expect(result.token).toBeUndefined();
    const credentials = await prisma.appCredential.findMany({
      where: { appId: grant.appId, status: "ACTIVE" },
    });
    expect(credentials).toHaveLength(1);
  });

  // ---- owner narrowing: actions & per-resource constraints ----------

  const MULTI_ACTION_DOCUMENT = {
    ...DOCUMENT,
    requests: [
      {
        resource: "llm:testprov",
        actions: ["chat.completions", "models.list"],
        reason: "Integration test coverage.",
        constraints: { maxOutputTokens: 512 },
      },
    ],
  };

  it("action narrowing: only the chosen actions are materialized", async () => {
    const grant = await service.createPendingGrant(MULTI_ACTION_DOCUMENT);
    cleanupAppIds.push(grant.appId);

    const result = await service.approveGrant(grant.id, {
      optionId: "standard",
      auth: "bearer",
      durationMs: null,
      renewal: null,
      allowBrowser: false,
      actions: { "0": ["chat.completions"] },
    });

    const permissions = await prisma.resourcePermission.findMany({
      where: { grantId: result.grant.id },
    });
    expect(permissions.map((row) => row.action)).toEqual(["chat.completions"]);
  });

  it("action narrowing: omitting the map grants everything requested", async () => {
    const grant = await service.createPendingGrant(MULTI_ACTION_DOCUMENT);
    cleanupAppIds.push(grant.appId);

    const result = await service.approveGrant(grant.id, {
      optionId: "standard",
      auth: "bearer",
      durationMs: null,
      renewal: null,
      allowBrowser: false,
    });

    const permissions = await prisma.resourcePermission.findMany({
      where: { grantId: result.grant.id },
    });
    expect(permissions.map((row) => row.action).sort()).toEqual([
      "chat.completions",
      "models.list",
    ]);
  });

  it("action narrowing: owners cannot grant an action that was not asked for", async () => {
    const grant = await service.createPendingGrant(DOCUMENT);
    cleanupAppIds.push(grant.appId);

    await expect(
      service.approveGrant(grant.id, {
        optionId: "standard",
        auth: "bearer",
        durationMs: null,
        renewal: null,
        allowBrowser: false,
        actions: { "0": ["chat.completions", "models.delete"] },
      }),
    ).rejects.toThrowError(/was not asked for/);

    const reread = await prisma.grant.findUnique({ where: { id: grant.id } });
    expect(reread?.status).toBe("PENDING");
  });

  it("action narrowing: dropping every action leaves nothing to approve", async () => {
    const grant = await service.createPendingGrant(DOCUMENT);
    cleanupAppIds.push(grant.appId);

    await expect(
      service.approveGrant(grant.id, {
        optionId: "standard",
        auth: "bearer",
        durationMs: null,
        renewal: null,
        allowBrowser: false,
        actions: { "0": [] },
      }),
    ).rejects.toThrowError(/no permissions/);
  });

  it("owner constraints override the app's own, per resource", async () => {
    const grant = await service.createPendingGrant(DOCUMENT);
    cleanupAppIds.push(grant.appId);

    const result = await service.approveGrant(grant.id, {
      optionId: "standard",
      auth: "bearer",
      durationMs: null,
      renewal: null,
      allowBrowser: false,
      constraints: {
        "llm:testprov": {
          maxOutputTokens: 128,
          allowedModels: ["tiny-model"],
        },
      },
    });

    const permissions = await prisma.resourcePermission.findMany({
      where: { grantId: result.grant.id },
    });
    // The app asked for 512; the owner tightened it to 128, and the
    // model allowlist is added on top of the request's own constraints.
    expect(permissions[0].constraints).toMatchObject({
      maxOutputTokens: 128,
      allowedModels: ["tiny-model"],
    });
  });
});
