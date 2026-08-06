import { describe, it, expect, vi, afterEach } from "vitest";
import { logger, redactSecrets } from "../logger";

// ============================================
// LOGGER REDACTION (Part 8 item 5)
// ck_ tokens, pairing strings, and provider-key shapes must NEVER
// appear in log output, in messages or nested context values.
// ============================================

const TOKEN = "ck_" + "a1B2c3D4e5".repeat(4);
const PAIRING = "pair::https://gw.example.com::abc123def456ghi789";
const PROVIDER_KEY = "gsk_" + "x".repeat(24);

describe("redactSecrets", () => {
  it("redacts grant tokens", () => {
    expect(redactSecrets(`token is ${TOKEN} ok`)).not.toContain(TOKEN);
    expect(redactSecrets(`token is ${TOKEN} ok`)).toContain("[REDACTED]");
  });

  it("redacts pairing strings and provider keys", () => {
    expect(redactSecrets(PAIRING)).not.toContain("abc123def456");
    expect(redactSecrets(`key ${PROVIDER_KEY}`)).not.toContain(PROVIDER_KEY);
  });

  it("leaves normal text alone", () => {
    expect(redactSecrets("Request completed for llm:groq")).toBe(
      "Request completed for llm:groq",
    );
  });
});

describe("logger output never contains ck_ tokens", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrubs messages and nested context on every level", () => {
    const captured: string[] = [];
    const capture = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    vi.spyOn(console, "log").mockImplementation(capture);
    vi.spyOn(console, "warn").mockImplementation(capture);
    vi.spyOn(console, "error").mockImplementation(capture);

    logger.info(`minted ${TOKEN}`);
    logger.warn("auth failed", { header: `Bearer ${TOKEN}` });
    logger.error("deep context", {
      nested: { list: [TOKEN, { evenDeeper: TOKEN }] },
    });

    const allOutput = captured.join("\n");
    expect(allOutput.length).toBeGreaterThan(0);
    expect(allOutput).not.toContain(TOKEN);
    expect(allOutput).not.toContain("ck_a1B2c3D4e5");
    expect(allOutput).toContain("[REDACTED]");
  });
});
