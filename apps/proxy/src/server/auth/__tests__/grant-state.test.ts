import { describe, it, expect } from "vitest";
import { checkGrantState } from "../resolve";
import type { Grant } from "@prisma/client";

// ============================================
// GRANT STATE GATE
// Expiry must cut off inline — the sweep cron only runs daily on Hobby
// deployments, so the data plane cannot rely on it for timely cutoffs.
// ============================================

const DAY_MS = 24 * 60 * 60 * 1000;

function grant(overrides: Partial<Grant>): Grant {
  return {
    id: "g1",
    appId: "a1",
    document: {},
    decisions: null,
    status: "ACTIVE",
    authType: "BEARER",
    runtime: "server",
    sourceUrl: null,
    expiresAt: null,
    renewalPeriodDays: null,
    currentPeriodEnd: null,
    inactivitySuspendDays: null,
    allowBrowser: false,
    egressIps: null,
    lastUsedAt: null,
    lastUsedIp: null,
    approvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Grant;
}

describe("checkGrantState", () => {
  it("passes an ACTIVE grant with future expiry", () => {
    expect(
      checkGrantState(
        grant({ expiresAt: new Date(Date.now() + DAY_MS) }),
      ),
    ).toBeNull();
  });

  it("passes an ACTIVE grant with no expiry at all", () => {
    expect(checkGrantState(grant({}))).toBeNull();
  });

  it("rejects inline when the hard expiry passed (before the sweep runs)", () => {
    const result = checkGrantState(
      grant({ expiresAt: new Date(Date.now() - 1000) }),
    );
    expect(result?.code).toBe("ERR_GRANT_EXPIRED");
    expect(result?.status).toBe(403);
  });

  it("rejects inline when the renewal period lapsed", () => {
    const result = checkGrantState(
      grant({
        expiresAt: new Date(Date.now() + 30 * DAY_MS),
        currentPeriodEnd: new Date(Date.now() - 1000),
      }),
    );
    expect(result?.code).toBe("ERR_GRANT_EXPIRED");
    expect(result?.message).toContain("renew");
  });

  it("maps non-ACTIVE statuses to their specific errors", () => {
    expect(checkGrantState(grant({ status: "PENDING" }))?.code).toBe("ERR_GRANT_PENDING");
    expect(checkGrantState(grant({ status: "SUSPENDED_MANUAL" }))?.code).toBe("ERR_GRANT_SUSPENDED");
    expect(checkGrantState(grant({ status: "REVOKED" }))?.code).toBe("ERR_GRANT_REVOKED");
    expect(checkGrantState(grant({ status: "EXPIRED" }))?.code).toBe("ERR_GRANT_EXPIRED");
    expect(checkGrantState(grant({ status: "DENIED" }))?.code).toBe("ERR_GRANT_DENIED");
  });
});
