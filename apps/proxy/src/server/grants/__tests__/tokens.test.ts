import { describe, it, expect } from "vitest";
import {
  generateTokenString,
  hashToken,
  computeTokenExpiry,
  TOKEN_PREFIX,
} from "../tokens";

describe("generateTokenString", () => {
  it("produces ck_ + 40 base62 chars", () => {
    const token = generateTokenString();
    expect(token).toMatch(/^ck_[0-9A-Za-z]{40}$/);
  });

  it("produces unique tokens", () => {
    const seen = new Set(
      Array.from({ length: 100 }, () => generateTokenString()),
    );
    expect(seen.size).toBe(100);
  });

  it("exports the ck_ prefix used by auth resolution", () => {
    expect(TOKEN_PREFIX).toBe("ck_");
  });
});

describe("hashToken", () => {
  it("is a stable sha256 hex", () => {
    const token = "ck_" + "a".repeat(40);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken(token + "x"));
  });
});

describe("computeTokenExpiry", () => {
  const grantEnd = new Date("2027-01-01T00:00:00Z");
  const periodEnd = new Date("2026-09-01T00:00:00Z");

  it("uses min(grant expiry, current period end)", () => {
    expect(
      computeTokenExpiry({ expiresAt: grantEnd, currentPeriodEnd: periodEnd }),
    ).toEqual(periodEnd);
  });

  it("falls back to grant expiry when non-renewable", () => {
    expect(
      computeTokenExpiry({ expiresAt: grantEnd, currentPeriodEnd: null }),
    ).toEqual(grantEnd);
  });

  it("caps unbounded grants far in the future", () => {
    const expiry = computeTokenExpiry({
      expiresAt: null,
      currentPeriodEnd: null,
    });
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });
});
