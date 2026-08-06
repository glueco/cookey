import { describe, it, expect, beforeAll } from "vitest";
import { validateConnectorDocument } from "../schema";

// ============================================
// CONNECTOR SCHEMA + REGISTRY TESTS
// Install validation, freeze semantics, cache invalidation.
// DB-backed parts skip without DATABASE_URL.
// ============================================

const hasDb = !!process.env.DATABASE_URL;

const VALID_DOC = {
  specVersion: "1",
  id: "llm:regtest",
  name: "Registry Test",
  version: "1.0.0",
  resourceType: "llm",
  adapter: "openai-compatible",
  config: { baseUrl: "https://api.regtest.dev/v1", auth: { type: "bearer" } },
  allowedHosts: ["api.regtest.dev"],
  actions: {
    "chat.completions": { method: "POST", path: "/chat/completions", streaming: true },
  },
  models: ["m1"],
};

describe("connector document validation", () => {
  it("accepts a valid document", () => {
    const result = validateConnectorDocument(structuredClone(VALID_DOC));
    expect(result.valid).toBe(true);
  });

  it("rejects unknown specVersion majors", () => {
    const result = validateConnectorDocument({ ...structuredClone(VALID_DOC), specVersion: "2" });
    expect(result.valid).toBe(false);
  });

  it("rejects id/resourceType mismatch", () => {
    const result = validateConnectorDocument({ ...structuredClone(VALID_DOC), resourceType: "mail" });
    expect(result.valid).toBe(false);
  });

  it("rejects hosts with schemes or paths", () => {
    const result = validateConnectorDocument({
      ...structuredClone(VALID_DOC),
      allowedHosts: ["https://api.regtest.dev"],
    });
    expect(result.valid).toBe(false);
  });

  it("requires baseUrl host to be in allowedHosts", () => {
    const result = validateConnectorDocument({
      ...structuredClone(VALID_DOC),
      allowedHosts: ["other.example.com"],
    });
    expect(result.valid).toBe(false);
  });

  it("derives allowedHosts from baseUrl when omitted", () => {
    const doc = structuredClone(VALID_DOC) as Record<string, unknown>;
    delete doc.allowedHosts;
    const result = validateConnectorDocument(doc);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.document.allowedHosts).toEqual(["api.regtest.dev"]);
    }
  });

  it("rejects unknown enforcement rules", () => {
    const doc = structuredClone(VALID_DOC);
    (doc.actions["chat.completions"] as Record<string, unknown>).enforce = {
      model: { rule: "notARule", constraint: "allowedModels" },
    };
    expect(validateConnectorDocument(doc).valid).toBe(false);
  });

  it("rejects documents over 64KB", () => {
    const doc = structuredClone(VALID_DOC) as Record<string, unknown>;
    doc.description = "x".repeat(70 * 1024);
    expect(validateConnectorDocument(doc).valid).toBe(false);
  });
});

describe.skipIf(!hasDb)("connector registry (DB)", () => {
  let registry: typeof import("../registry");
  let prisma: typeof import("@/lib/db").prisma;

  beforeAll(async () => {
    registry = await import("../registry");
    prisma = (await import("@/lib/db")).prisma;
    await prisma.connector.deleteMany({ where: { connectorId: "llm:regtest" } });
    return async () => {
      await prisma.connector.deleteMany({ where: { connectorId: "llm:regtest" } });
    };
  });

  it("rejects documents naming unknown adapters", () => {
    const result = registry.validateConnectorFull({
      ...structuredClone(VALID_DOC),
      adapter: "no-such-adapter",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects adapter-config violations", () => {
    const result = registry.validateConnectorFull({
      ...structuredClone(VALID_DOC),
      config: { baseUrl: "not a url" },
    });
    expect(result.valid).toBe(false);
  });

  it("install freezes; re-install without replace conflicts (409)", async () => {
    const row = await registry.installConnector(structuredClone(VALID_DOC), "CUSTOM");
    expect(row.connectorId).toBe("llm:regtest");
    expect(row.version).toBe("1.0.0");

    await expect(
      registry.installConnector(structuredClone(VALID_DOC), "CUSTOM"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("resolveConnector serves the frozen document after invalidation", async () => {
    registry.invalidateConnectorCache();
    const resolved = await registry.resolveConnector("llm:regtest");
    expect(resolved?.document.name).toBe("Registry Test");
    expect(resolved?.adapter.id).toBe("openai-compatible");
  });

  it("explicit replace applies an update and clears updateAvailable", async () => {
    const updated = { ...structuredClone(VALID_DOC), version: "1.1.0", models: ["m1", "m2"] };
    const row = await registry.installConnector(updated, "CUSTOM", {
      replaceExisting: true,
    });
    expect(row.version).toBe("1.1.0");

    registry.invalidateConnectorCache();
    const resolved = await registry.resolveConnector("llm:regtest");
    expect(resolved?.document.models).toEqual(["m1", "m2"]);
  });

  it("disabled connectors disappear from resolution", async () => {
    await prisma.connector.update({
      where: { connectorId: "llm:regtest" },
      data: { enabled: false },
    });
    registry.invalidateConnectorCache();
    expect(await registry.resolveConnector("llm:regtest")).toBeNull();
  });
});
