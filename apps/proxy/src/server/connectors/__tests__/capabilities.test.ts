import { describe, it, expect } from "vitest";
import {
  deriveConstraintSpecs,
  describeConnector,
  sanitizeConstraints,
} from "../capabilities";
import type { ConnectorDocument } from "../schema";
import groqSeed from "../builtin/llm-groq.json";
import resendSeed from "../builtin/mail-resend.json";

// ============================================
// The approval screen's per-service limits are derived from the same
// enforce maps the engine reads, so these tests pin the invariant that
// makes that safe: a control is offered if and only if something will
// actually act on it.
// ============================================

const groq = groqSeed as unknown as ConnectorDocument;
const resend = resendSeed as unknown as ConnectorDocument;

describe("deriveConstraintSpecs", () => {
  it("derives one control per enforceable constraint on an LLM connector", () => {
    const specs = deriveConstraintSpecs(groq);
    const byKey = Object.fromEntries(specs.map((spec) => [spec.key, spec]));

    expect(Object.keys(byKey).sort()).toEqual([
      "allowStreaming",
      "allowTools",
      "allowedModels",
      "maxOutputTokens",
    ]);
    expect(byKey.allowedModels.control).toBe("models");
    expect(byKey.allowedModels.options).toEqual(groq.models);
    expect(byKey.maxOutputTokens.control).toBe("number");
    expect(byKey.maxOutputTokens.fallback).toBe(4096);
    expect(byKey.allowStreaming.control).toBe("boolean");
    expect(byKey.allowTools.control).toBe("boolean");
  });

  it("scopes each constraint to the actions that enforce it", () => {
    const specs = deriveConstraintSpecs(groq);
    for (const spec of specs) {
      // models.list declares no enforce map, so nothing may claim it.
      expect(spec.actions).toEqual(["chat.completions"]);
    }
  });

  it("collapses a constraint shared by several fields into one control", () => {
    const specs = deriveConstraintSpecs(resend);
    // maxRecipients is enforced on to + cc + bcc, but the engine caps
    // their COMBINED count — so the owner must see a single control.
    const recipients = specs.filter((spec) => spec.key === "maxRecipients");
    expect(recipients).toHaveLength(1);
    expect(recipients[0].control).toBe("number");

    const toDomains = specs.find((spec) => spec.key === "allowedToDomains");
    expect(toDomains?.control).toBe("domains");
  });

  it("offers nothing for a connector with no enforce maps", () => {
    const bare = {
      ...groq,
      actions: { "models.list": groq.actions["models.list"] },
    } as ConnectorDocument;
    expect(deriveConstraintSpecs(bare)).toEqual([]);
  });
});

describe("describeConnector", () => {
  it("summarizes actions, models and credential status", () => {
    const described = describeConnector(groq, {
      configured: true,
      name: "My Groq key",
    });
    expect(described.resourceId).toBe("llm:groq");
    expect(described.name).toBe("My Groq key");
    expect(described.configured).toBe(true);
    expect(described.actions.map((a) => a.id).sort()).toEqual([
      "chat.completions",
      "models.list",
    ]);
    expect(
      described.actions.find((a) => a.id === "chat.completions")?.streaming,
    ).toBe(true);
  });

  it("falls back to the connector's own name when no credential is stored", () => {
    const described = describeConnector(groq, { configured: false });
    expect(described.name).toBe("Groq");
    expect(described.configured).toBe(false);
  });
});

describe("sanitizeConstraints", () => {
  const specs = deriveConstraintSpecs(groq);

  it("keeps values the connector can enforce", () => {
    expect(
      sanitizeConstraints(specs, {
        allowedModels: ["llama-3.1-8b-instant"],
        maxOutputTokens: 512,
        allowStreaming: false,
      }),
    ).toEqual({
      allowedModels: ["llama-3.1-8b-instant"],
      maxOutputTokens: 512,
      allowStreaming: false,
    });
  });

  it("drops keys this connector cannot enforce", () => {
    // maxRecipients is a mail constraint — storing it on an LLM
    // permission would show the owner a limit nothing honours.
    expect(
      sanitizeConstraints(specs, { maxRecipients: 5, nonsense: true }),
    ).toEqual({});
  });

  it("drops an empty allowlist rather than storing a false lock", () => {
    expect(sanitizeConstraints(specs, { allowedModels: [] })).toEqual({});
  });

  it("stores only the denying side of a boolean", () => {
    // `true` is the engine's default, so writing it adds nothing but noise.
    expect(sanitizeConstraints(specs, { allowStreaming: true })).toEqual({});
    expect(sanitizeConstraints(specs, { allowTools: false })).toEqual({
      allowTools: false,
    });
  });

  it("rejects non-positive and unparseable numbers", () => {
    expect(sanitizeConstraints(specs, { maxOutputTokens: 0 })).toEqual({});
    expect(sanitizeConstraints(specs, { maxOutputTokens: -10 })).toEqual({});
    expect(sanitizeConstraints(specs, { maxOutputTokens: "abc" })).toEqual({});
    expect(sanitizeConstraints(specs, { maxOutputTokens: "2048" })).toEqual({
      maxOutputTokens: 2048,
    });
  });

  it("normalizes list entries and removes duplicates", () => {
    expect(
      sanitizeConstraints(specs, {
        allowedModels: [" llama-3.1-8b-instant ", "llama-3.1-8b-instant", ""],
      }),
    ).toEqual({ allowedModels: ["llama-3.1-8b-instant"] });
  });
});
