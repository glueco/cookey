import { describe, it, expect, beforeAll, afterAll } from "vitest";

// ============================================
// INTEGRATION — owner pricing overrides
// Overrides on the Connector row must surface through resolveConnector
// (the single path enforcement, capabilities and the approval screen
// all read documents from) without touching the frozen document.
// Requires DATABASE_URL; skipped otherwise.
// ============================================

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("connector pricing overrides", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let registry: typeof import("../registry");
  let originalOverrides: unknown;

  beforeAll(async () => {
    prisma = (await import("@/lib/db")).prisma;
    registry = await import("../registry");
    const row = await prisma.connector.findUnique({
      where: { connectorId: "llm:groq" },
    });
    originalOverrides = row?.pricingOverrides ?? null;
  });

  afterAll(async () => {
    await prisma.connector.update({
      where: { connectorId: "llm:groq" },
      data: {
        pricingOverrides:
          originalOverrides === null
            ? (await import("@prisma/client")).Prisma.JsonNull
            : (originalOverrides as object),
      },
    });
    registry.invalidateConnectorCache();
  });

  it("merges overrides over document pricing at resolve time", async () => {
    const before = await registry.resolveConnector("llm:groq");
    expect(before).not.toBeNull();
    const documentPricing = before!.document.pricing ?? {};
    const [pricedModel] = Object.keys(documentPricing);
    expect(pricedModel).toBeTruthy();

    await prisma.connector.update({
      where: { connectorId: "llm:groq" },
      data: {
        pricingOverrides: {
          [pricedModel]: { inputPerMTok: 0, outputPerMTok: 0 }, // free tier
          "totally-new-model": { inputPerMTok: 1.5, outputPerMTok: 3 },
        },
      },
    });
    registry.invalidateConnectorCache();

    const after = await registry.resolveConnector("llm:groq");
    const effective = after!.document.pricing!;
    // Overridden model reads as explicitly free
    expect(effective[pricedModel]).toEqual({
      inputPerMTok: 0,
      outputPerMTok: 0,
    });
    // A model the document never priced can be priced by the owner
    expect(effective["totally-new-model"]).toEqual({
      inputPerMTok: 1.5,
      outputPerMTok: 3,
    });
    // Un-overridden document entries survive the merge
    for (const model of Object.keys(documentPricing)) {
      if (model !== pricedModel) {
        expect(effective[model]).toEqual(documentPricing[model]);
      }
    }
    // The FROZEN row document is untouched
    const row = await prisma.connector.findUnique({
      where: { connectorId: "llm:groq" },
    });
    const frozen = row!.document as { pricing?: Record<string, unknown> };
    expect(frozen.pricing?.[pricedModel]).toEqual(
      documentPricing[pricedModel],
    );
  });
});
