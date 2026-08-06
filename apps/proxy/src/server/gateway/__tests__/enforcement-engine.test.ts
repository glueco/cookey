import { describe, it, expect } from "vitest";
import {
  applyEnforcement,
  extractUsage,
  mapUpstreamError,
  redactSecret,
} from "../enforce";
import type {
  ActionSpec,
  ConnectorDocument,
} from "@/server/connectors/schema";

// ============================================
// GENERIC ENFORCEMENT ENGINE TESTS (4.3)
// Preserves the schema-first invariants: fail-closed on missing fields
// under active constraints, single body parse, no upstream on violation.
// ============================================

const CONNECTOR = {
  specVersion: "1",
  id: "llm:testprov",
  name: "Test",
  version: "1.0.0",
  resourceType: "llm",
  adapter: "openai-compatible",
  config: { baseUrl: "https://api.test.dev/v1" },
  allowedHosts: ["api.test.dev"],
  models: ["default-a", "default-b"],
  actions: {},
} as unknown as ConnectorDocument;

const CHAT_ACTION: ActionSpec = {
  method: "POST",
  path: "/chat/completions",
  streaming: true,
  enforce: {
    model: { rule: "allowedValues", constraint: "allowedModels" },
    max_tokens: { rule: "clampMax", constraint: "maxOutputTokens", default: 4096 },
    stream: { rule: "allowFlag", constraint: "allowStreaming" },
    tools: { rule: "forbidField", constraint: "allowTools" },
  },
};

const MAIL_ACTION: ActionSpec = {
  method: "POST",
  path: "/emails",
  streaming: false,
  enforce: {
    from: { rule: "domainAllowlist", constraint: "allowedFromDomains" },
    to: [
      { rule: "domainAllowlist", constraint: "allowedToDomains" },
      { rule: "maxItems", constraint: "maxRecipients" },
    ],
    attachments: { rule: "forbidField", constraint: "allowAttachments" },
  },
};

describe("allowedValues", () => {
  it("accepts a model in the constraint allowlist", () => {
    const result = applyEnforcement(CHAT_ACTION, CONNECTOR, { allowedModels: ["m1"] }, { model: "m1" });
    expect(result.allowed).toBe(true);
  });

  it("rejects a model outside the allowlist", () => {
    const result = applyEnforcement(CHAT_ACTION, CONNECTOR, { allowedModels: ["m1"] }, { model: "m2" });
    expect(result.allowed).toBe(false);
  });

  it("fail-closed: rejects when model is missing under an allowlist", () => {
    const result = applyEnforcement(CHAT_ACTION, CONNECTOR, { allowedModels: ["m1"] }, {});
    expect(result.allowed).toBe(false);
  });

  it("falls back to the connector model catalog when allowedModels unset", () => {
    const ok = applyEnforcement(CHAT_ACTION, CONNECTOR, {}, { model: "default-a" });
    expect(ok.allowed).toBe(true);
    const bad = applyEnforcement(CHAT_ACTION, CONNECTOR, {}, { model: "not-in-catalog" });
    expect(bad.allowed).toBe(false);
  });

  it("normalizes the models/ prefix (Gemini)", () => {
    const result = applyEnforcement(CHAT_ACTION, CONNECTOR, { allowedModels: ["gemini-pro"] }, { model: "models/gemini-pro" });
    expect(result.allowed).toBe(true);
  });
});

describe("clampMax", () => {
  it("silently caps values above the constraint", () => {
    const body = { model: "default-a", max_tokens: 100000 };
    const result = applyEnforcement(CHAT_ACTION, CONNECTOR, { maxOutputTokens: 512 }, body);
    expect(result.allowed).toBe(true);
    expect(body.max_tokens).toBe(512);
  });

  it("applies the rule default when the field is absent and no constraint set", () => {
    const body: Record<string, unknown> = { model: "default-a" };
    const result = applyEnforcement(CHAT_ACTION, CONNECTOR, {}, body);
    expect(result.allowed).toBe(true);
    expect(body.max_tokens).toBe(4096);
  });

  it("leaves values under the cap untouched", () => {
    const body = { model: "default-a", max_tokens: 100 };
    applyEnforcement(CHAT_ACTION, CONNECTOR, { maxOutputTokens: 512 }, body);
    expect(body.max_tokens).toBe(100);
  });

  it("reports clamping so the x-cookey-clamped header can be set", () => {
    const clamped = applyEnforcement(CHAT_ACTION, CONNECTOR, { maxOutputTokens: 512 }, { model: "default-a", max_tokens: 9999 });
    expect(clamped.allowed && clamped.clamped).toBe(true);

    const untouched = applyEnforcement(CHAT_ACTION, CONNECTOR, { maxOutputTokens: 512 }, { model: "default-a", max_tokens: 10 });
    expect(untouched.allowed && !untouched.clamped).toBe(true);
  });
});

describe("allowFlag", () => {
  it("blocks stream=true when allowStreaming is false", () => {
    const result = applyEnforcement(CHAT_ACTION, CONNECTOR, { allowStreaming: false }, { model: "default-a", stream: true });
    expect(result.allowed).toBe(false);
  });

  it("allows stream when the constraint is absent", () => {
    const result = applyEnforcement(CHAT_ACTION, CONNECTOR, {}, { model: "default-a", stream: true });
    expect(result.allowed).toBe(true);
  });
});

describe("forbidField", () => {
  it("blocks tools when allowTools=false", () => {
    const result = applyEnforcement(CHAT_ACTION, CONNECTOR, { allowTools: false }, { model: "default-a", tools: [{ type: "function" }] });
    expect(result.allowed).toBe(false);
  });

  it("treats empty arrays as absent", () => {
    const result = applyEnforcement(CHAT_ACTION, CONNECTOR, { allowTools: false }, { model: "default-a", tools: [] });
    expect(result.allowed).toBe(true);
  });
});

describe("domainAllowlist + maxItems (mail)", () => {
  const constraints = {
    allowedFromDomains: ["myapp.com"],
    allowedToDomains: ["example.com"],
    maxRecipients: 2,
  };

  it("accepts a compliant email", () => {
    const result = applyEnforcement(MAIL_ACTION, CONNECTOR, constraints, {
      from: "Bot <bot@myapp.com>",
      to: ["a@example.com", "b@example.com"],
    });
    expect(result.allowed).toBe(true);
  });

  it("rejects a from-domain outside the allowlist", () => {
    const result = applyEnforcement(MAIL_ACTION, CONNECTOR, constraints, {
      from: "bot@evil.com",
      to: ["a@example.com"],
    });
    expect(result.allowed).toBe(false);
  });

  it("checks array fields element-wise", () => {
    const result = applyEnforcement(MAIL_ACTION, CONNECTOR, constraints, {
      from: "bot@myapp.com",
      to: ["a@example.com", "b@evil.com"],
    });
    expect(result.allowed).toBe(false);
  });

  it("enforces maxItems on recipients (scalar counts as 1)", () => {
    const over = applyEnforcement(MAIL_ACTION, CONNECTOR, constraints, {
      from: "bot@myapp.com",
      to: ["a@example.com", "b@example.com", "c@example.com"],
    });
    expect(over.allowed).toBe(false);

    const scalar = applyEnforcement(MAIL_ACTION, CONNECTOR, constraints, {
      from: "bot@myapp.com",
      to: "a@example.com",
    });
    expect(scalar.allowed).toBe(true);
  });

  it("blocks attachments when allowAttachments=false", () => {
    const result = applyEnforcement(MAIL_ACTION, CONNECTOR, { ...constraints, allowAttachments: false }, {
      from: "bot@myapp.com",
      to: "a@example.com",
      attachments: [{ filename: "x.pdf" }],
    });
    expect(result.allowed).toBe(false);
  });
});

describe("body invariants", () => {
  it("rejects non-object bodies on enforced actions", () => {
    expect(applyEnforcement(CHAT_ACTION, CONNECTOR, {}, "raw string").allowed).toBe(false);
    expect(applyEnforcement(CHAT_ACTION, CONNECTOR, {}, [1, 2]).allowed).toBe(false);
    expect(applyEnforcement(CHAT_ACTION, CONNECTOR, {}, null).allowed).toBe(false);
  });

  it("passes anything through when the action has no enforce map", () => {
    const action: ActionSpec = { method: "GET", path: "/models", streaming: false };
    expect(applyEnforcement(action, CONNECTOR, {}, undefined).allowed).toBe(true);
  });
});

describe("extractUsage", () => {
  it("reads dot paths from the response", () => {
    const usage = extractUsage(
      {
        inputTokens: "usage.prompt_tokens",
        outputTokens: "usage.completion_tokens",
        totalTokens: "usage.total_tokens",
        model: "model",
      },
      { model: "m1", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
    );
    expect(usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, model: "m1" });
  });

  it("returns empty for missing paths or spec", () => {
    expect(extractUsage(undefined, {})).toEqual({});
    expect(extractUsage({ totalTokens: "usage.total" }, {})).toEqual({
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
      model: undefined,
    });
  });
});

describe("mapUpstreamError", () => {
  const connector = {
    ...CONNECTOR,
    errorMap: { "401": "UNAUTHORIZED", "429": "RATE_LIMITED", insufficient_quota: "QUOTA_EXCEEDED" },
    errorCodePath: "error.code",
  } as ConnectorDocument;

  it("maps by provider error code before status", () => {
    const mapped = mapUpstreamError(
      connector,
      429,
      JSON.stringify({ error: { code: "insufficient_quota", message: "Quota exceeded" } }),
      "sk-secret",
    );
    expect(mapped.code).toBe("QUOTA_EXCEEDED");
    expect(mapped.status).toBe(429);
  });

  it("maps by status when no code matches", () => {
    const mapped = mapUpstreamError(connector, 401, "{}", "sk-secret");
    expect(mapped.code).toBe("UNAUTHORIZED");
  });

  it("falls back to ERR_UPSTREAM_ERROR with status passthrough", () => {
    const mapped = mapUpstreamError(connector, 418, "teapot", "sk-secret");
    expect(mapped.code).toBe("ERR_UPSTREAM_ERROR");
    expect(mapped.status).toBe(418);
  });

  it("redacts credential echoes from error messages", () => {
    const secret = "sk-super-secret-key-12345";
    const mapped = mapUpstreamError(
      connector,
      401,
      JSON.stringify({ error: { message: `Invalid key: ${secret}` } }),
      secret,
    );
    expect(mapped.message).not.toContain(secret);
    expect(mapped.message).toContain("[REDACTED]");
  });
});

describe("redactSecret", () => {
  it("redacts full and truncated occurrences", () => {
    const secret = "gsk_abcdefghijklmnop";
    expect(redactSecret(`key ${secret} leaked`, secret)).not.toContain(secret);
    expect(redactSecret(`key ${secret.slice(0, 12)}… leaked`, secret)).not.toContain(secret.slice(0, 12));
  });

  it("leaves text alone for short secrets (avoids over-redaction)", () => {
    expect(redactSecret("hello ab", "ab")).toBe("hello ab");
  });
});
