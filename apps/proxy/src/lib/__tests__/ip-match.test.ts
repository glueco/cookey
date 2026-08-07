import { describe, it, expect } from "vitest";
import {
  ipMatchesList,
  ipMatchesPattern,
  parseIpPatterns,
} from "../ip-match";

describe("parseIpPatterns", () => {
  it("splits on newlines and commas, trimming blanks", () => {
    expect(parseIpPatterns("1.2.3.4, 5.6.7.8\n9.10.11.12\n\n")).toEqual([
      "1.2.3.4",
      "5.6.7.8",
      "9.10.11.12",
    ]);
  });
});

describe("ipMatchesPattern — exact", () => {
  it("matches identical IPv4", () => {
    expect(ipMatchesPattern("203.0.113.7", "203.0.113.7")).toBe(true);
  });

  it("rejects different IPv4", () => {
    expect(ipMatchesPattern("203.0.113.8", "203.0.113.7")).toBe(false);
  });

  it("matches identical IPv6", () => {
    expect(ipMatchesPattern("2001:db8::1", "2001:db8::1")).toBe(true);
  });

  it("matches IPv4-mapped IPv6 against the plain IPv4 pattern", () => {
    expect(ipMatchesPattern("::ffff:203.0.113.7", "203.0.113.7")).toBe(true);
  });
});

describe("ipMatchesPattern — wildcard", () => {
  it("matches segment wildcards", () => {
    expect(ipMatchesPattern("192.168.4.20", "192.168.*.*")).toBe(true);
  });

  it("treats short patterns as trailing wildcards", () => {
    expect(ipMatchesPattern("192.168.4.20", "192.168.*")).toBe(true);
  });

  it("rejects when a fixed segment differs", () => {
    expect(ipMatchesPattern("192.169.4.20", "192.168.*")).toBe(false);
  });

  it("does not treat wildcard segments as substrings", () => {
    expect(ipMatchesPattern("1192.168.4.20", "192.168.*")).toBe(false);
  });
});

describe("ipMatchesPattern — CIDR", () => {
  it("matches inside the block", () => {
    expect(ipMatchesPattern("203.0.113.77", "203.0.113.0/24")).toBe(true);
  });

  it("rejects outside the block", () => {
    expect(ipMatchesPattern("203.0.114.1", "203.0.113.0/24")).toBe(false);
  });

  it("handles /32 exact blocks", () => {
    expect(ipMatchesPattern("10.0.0.5", "10.0.0.5/32")).toBe(true);
    expect(ipMatchesPattern("10.0.0.6", "10.0.0.5/32")).toBe(false);
  });

  it("handles /0 as match-all", () => {
    expect(ipMatchesPattern("8.8.8.8", "0.0.0.0/0")).toBe(true);
  });

  it("rejects malformed CIDR", () => {
    expect(ipMatchesPattern("10.0.0.5", "10.0.0.5/33")).toBe(false);
    expect(ipMatchesPattern("10.0.0.5", "banana/24")).toBe(false);
  });
});

describe("ipMatchesList", () => {
  it("matches when any pattern matches", () => {
    const list = "10.0.0.0/8\n192.168.1.*, 203.0.113.7";
    expect(ipMatchesList("10.20.30.40", list)).toBe(true);
    expect(ipMatchesList("192.168.1.99", list)).toBe(true);
    expect(ipMatchesList("203.0.113.7", list)).toBe(true);
    expect(ipMatchesList("8.8.8.8", list)).toBe(false);
  });

  it("fails closed on a whitespace-only list (grant claims IP pinning)", () => {
    expect(ipMatchesList("8.8.8.8", "  \n ")).toBe(false);
  });
});
