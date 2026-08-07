import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/lib/admin-auth";
import { safeFetch, SafeFetchError } from "@/lib/safe-fetch";
import {
  installConnector,
  validateConnectorFull,
  ConnectorInstallError,
  restoreBuiltins,
} from "@/server/connectors/registry";
import { listAdapterIds } from "@/server/adapters";
import { getMarketplaceUrl } from "@/server/settings";

// ============================================
// /api/admin/connectors
// GET  — list installed connectors (+ credential status, adapters)
// POST — install:
//   { url, preview: true }        → fetch (SSRF-guarded) + validate,
//                                   return the document for review
//   { url, document }             → confirm-install: freeze the exact
//                                   previewed document (no re-fetch,
//                                   no TOCTOU)
//   { document }                  → custom-builder install (CUSTOM)
//   { restoreBuiltins: true }     → re-seed the built-in documents
// ============================================

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [connectors, secrets] = await Promise.all([
    prisma.connector.findMany({ orderBy: { connectorId: "asc" } }),
    prisma.resourceSecret.findMany({
      where: { status: "ACTIVE" },
      select: { resourceId: true },
    }),
  ]);
  const configured = new Set(secrets.map((s) => s.resourceId));

  return NextResponse.json({
    connectors: connectors.map((row) => ({
      ...row,
      credentialsConfigured: configured.has(row.connectorId),
    })),
    adapters: listAdapterIds(),
  });
}

const InstallSchema = z.union([
  z.object({ url: z.string().url(), preview: z.literal(true) }),
  z.object({
    url: z.string().url(),
    document: z.record(z.unknown()),
    registry: z.boolean().optional(),
  }),
  z.object({
    document: z.record(z.unknown()),
    // Builder re-save/edit: replace an existing CUSTOM connector in place
    replace: z.boolean().optional(),
  }),
  z.object({ restoreBuiltins: z.literal(true) }),
]);

export async function POST(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = InstallSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Expected { url, preview: true }, { url, document }, { document }, or { restoreBuiltins: true }",
      },
      { status: 400 },
    );
  }
  const data = parsed.data;

  try {
    if ("restoreBuiltins" in data) {
      const restored = await restoreBuiltins();
      return NextResponse.json({ restored });
    }

    if ("preview" in data) {
      // Step 1: fetch through the SSRF guard, validate, return for review
      const fetched = await safeFetch(data.url);
      if (fetched.status !== 200) {
        return NextResponse.json(
          { error: `The URL returned HTTP ${fetched.status}` },
          { status: 422 },
        );
      }
      let raw: unknown;
      try {
        raw = JSON.parse(fetched.text);
      } catch {
        return NextResponse.json(
          { error: "The URL did not return valid JSON" },
          { status: 422 },
        );
      }
      const validation = validateConnectorFull(raw);
      if (!validation.valid) {
        return NextResponse.json(
          { error: "Connector document failed validation", details: validation.errors },
          { status: 422 },
        );
      }
      return NextResponse.json({
        preview: validation.document,
        sourceUrl: data.url,
      });
    }

    if ("url" in data) {
      // Step 2: confirm-install — freeze the EXACT document the admin
      // reviewed (echoed back; validated again, never re-fetched).
      // The REGISTRY badge is only granted when the URL really lives
      // under the configured marketplace registry.
      let source: "URL" | "REGISTRY" = "URL";
      if (data.registry) {
        const registryUrl = await getMarketplaceUrl();
        const registryBase = registryUrl.slice(0, registryUrl.lastIndexOf("/") + 1);
        if (data.url.startsWith(registryBase)) source = "REGISTRY";
      }
      const row = await installConnector(data.document, source, {
        sourceUrl: data.url,
      });
      return NextResponse.json({ connector: row });
    }

    // Custom builder install / edit-in-place
    if (data.replace) {
      const connectorId = (data.document as { id?: unknown }).id;
      if (typeof connectorId === "string") {
        const existing = await prisma.connector.findUnique({
          where: { connectorId },
          select: { source: true },
        });
        // Only CUSTOM connectors may be replaced from the builder —
        // BUILTIN/URL/REGISTRY rows go through their own update flows.
        if (existing && existing.source !== "CUSTOM") {
          return NextResponse.json(
            {
              error: `Connector "${connectorId}" is a ${existing.source} connector — it can't be overwritten from the builder`,
            },
            { status: 409 },
          );
        }
      }
    }
    const row = await installConnector(data.document, "CUSTOM", {
      replaceExisting: data.replace ?? false,
    });
    return NextResponse.json({ connector: row });
  } catch (error) {
    if (error instanceof SafeFetchError) {
      return NextResponse.json(
        { error: `Fetch blocked: ${error.message}` },
        { status: 422 },
      );
    }
    if (error instanceof ConnectorInstallError) {
      return NextResponse.json(
        { error: error.message, details: error.errors },
        { status: error.status },
      );
    }
    console.error("Connector install error:", error);
    return NextResponse.json(
      { error: "Failed to install connector" },
      { status: 500 },
    );
  }
}
