import { describe, it, expect } from "vitest";
import { isPrivateIp, assertUrlSafe, SafeFetchError } from "../safe-fetch";

describe("isPrivateIp", () => {
  it("blocks loopback", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("127.255.255.255")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
  });

  it("blocks RFC1918 ranges", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
  });

  it("blocks link-local including cloud metadata IPs", () => {
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("169.254.0.1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
  });

  it("blocks IPv6 unique-local and unspecified", () => {
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fd12:3456::1")).toBe(true);
    expect(isPrivateIp("::")).toBe(true);
    expect(isPrivateIp("0.0.0.0")).toBe(true);
  });

  it("blocks CGNAT and IPv4-mapped forms", () => {
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("104.18.32.7")).toBe(false);
    expect(isPrivateIp("172.15.0.1")).toBe(false);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
    expect(isPrivateIp("2606:4700::1111")).toBe(false);
  });

  it("blocks hex-spelled IPv4-mapped IPv6 loopback/private", () => {
    expect(isPrivateIp("::ffff:7f00:1")).toBe(true); // 127.0.0.1
    expect(isPrivateIp("::ffff:c0a8:101")).toBe(true); // 192.168.1.1
    expect(isPrivateIp("::ffff:808:808")).toBe(false); // 8.8.8.8 (public)
  });
});

describe("assertUrlSafe", () => {
  it("rejects non-https schemes", async () => {
    await expect(
      assertUrlSafe(new URL("http://example.com/x")),
    ).rejects.toThrowError(SafeFetchError);
    await expect(
      assertUrlSafe(new URL("ftp://example.com/x")),
    ).rejects.toThrowError(SafeFetchError);
  });

  it("rejects literal private IPs regardless of scheme", async () => {
    await expect(
      assertUrlSafe(new URL("https://169.254.169.254/latest/meta-data")),
    ).rejects.toThrowError(/private address/);
    await expect(
      assertUrlSafe(new URL("https://127.0.0.1/admin")),
    ).rejects.toThrowError(/private address/);
    await expect(
      assertUrlSafe(new URL("https://[::1]/admin")),
    ).rejects.toThrowError(/private address/);
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    // localhost resolves to 127.0.0.1/::1 everywhere
    await expect(
      assertUrlSafe(new URL("https://localhost/x")),
    ).rejects.toThrowError(SafeFetchError);
  });

  it("rejects non-canonical numeric IP literals outright", async () => {
    // decimal spelling of 127.0.0.1
    await expect(
      assertUrlSafe(new URL("https://2130706433/")),
    ).rejects.toThrowError(/non-canonical|private/);
    // octal spelling of 127.0.0.1
    await expect(
      assertUrlSafe(new URL("https://0177.0.0.1/")),
    ).rejects.toThrowError(/non-canonical|private/);
    // short form
    await expect(
      assertUrlSafe(new URL("https://127.1/")),
    ).rejects.toThrowError(/non-canonical|private/);
  });

  it("rejects hex-form IPv4-mapped IPv6 private literals", async () => {
    await expect(
      assertUrlSafe(new URL("https://[::ffff:7f00:1]/")),
    ).rejects.toThrowError(/private address/);
  });
});
