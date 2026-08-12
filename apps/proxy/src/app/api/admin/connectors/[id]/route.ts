import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { checkAdminAuth } from "@/lib/admin-auth";
import { safeFetch, SafeFetchError } from "@/lib/safe-fetch";
import {
  installConnector,
  validateConnectorFull,
  invalidateConnectorCache,
  ConnectorInstallError,
} from "@/server/connectors/registry";
import type { ConnectorDocument } from "@/server/connectors/schema";

// ============================================
// /api/admin/connectors/[id]   (id = connectorId, e.g. "llm:groq",
//                               URL-encoded — or the row cuid)
// GET    — row + frozen document + credential status
// PATCH  — { enabled } | { action: "check_update" } |
//          { action: "apply_update", document } (explicit re-approval)
// DELETE — remove; blocked while ACTIVE grants have bound permissions
// ============================================

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function findConnector(id: string) {
  const decoded = decodeURIComponent(id);
  return prisma.connector.findFirst({
    where: { OR: [{ connectorId: decoded }, { id: decoded }] },
  });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await findConnector(id);
  if (!row) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  const secret = await prisma.resourceSecret.findUnique({
    where: { resourceId: row.connectorId },
    select: { resourceId: true, status: true, config: true, updatedAt: true },
  });

  const boundGrants = await prisma.resourcePermission.findMany({
    where: {
      resourceId: row.connectorId,
      status: "ACTIVE",
      grant: { status: "ACTIVE" },
    },
    select: {
      grant: { select: { id: true, document: true } },
    },
    distinct: ["grantId"],
  });

  return NextResponse.json({
    connector: row,
    credentials: secret
      ? { configured: true, config: secret.config, updatedAt: secret.updatedAt }
      : { configured: false },
    boundGrants: boundGrants
      .filter((p) => p.grant)
      .map((p) => ({
        grantId: p.grant!.id,
        appName:
          (p.grant!.document as { app?: { name?: string } })?.app?.name ??
          "unknown",
      })),
  });
}

const PricingOverrideSchema = z.object({
  inputPerMTok: z.number().nonnegative().finite(),
  outputPerMTok: z.number().nonnegative().finite(),
});

const PatchSchema = z.union([
  z.object({ enabled: z.boolean() }),
  z.object({ action: z.literal("check_update") }),
  z.object({
    action: z.literal("apply_update"),
    document: z.record(z.unknown()),
  }),
  // Per-model pricing corrections, merged into the stored overrides:
  // an entry sets a model's effective rates (0/0 = explicitly free),
  // null removes the override so the document's own pricing returns.
  z.object({
    pricingOverrides: z.record(
      z.string().min(1).max(200),
      z.union([PricingOverrideSchema, z.null()]),
    ),
  }),
]);

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await findConnector(id);
  if (!row) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const data = parsed.data;

  try {
    if ("enabled" in data) {
      const updated = await prisma.connector.update({
        where: { id: row.id },
        data: { enabled: data.enabled },
      });
      invalidateConnectorCache();
      return NextResponse.json({ connector: updated });
    }

    if ("pricingOverrides" in data) {
      const current =
        (row.pricingOverrides as Record<string, unknown> | null) ?? {};
      const merged: Record<string, unknown> = { ...current };
      for (const [model, value] of Object.entries(data.pricingOverrides)) {
        if (value === null) delete merged[model];
        else merged[model] = value;
      }
      const updated = await prisma.connector.update({
        where: { id: row.id },
        data: {
          pricingOverrides:
            Object.keys(merged).length > 0
              ? (merged as Prisma.InputJsonValue)
              : Prisma.JsonNull,
        },
      });
      invalidateConnectorCache();
      return NextResponse.json({ connector: updated });
    }

    if (data.action === "check_update") {
      if (!row.sourceUrl) {
        return NextResponse.json(
          { error: "This connector has no source URL to check" },
          { status: 400 },
        );
      }
      const fetched = await safeFetch(row.sourceUrl);
      if (fetched.status !== 200) {
        return NextResponse.json(
          { error: `Source returned HTTP ${fetched.status}` },
          { status: 422 },
        );
      }
      let raw: unknown;
      try {
        raw = JSON.parse(fetched.text);
      } catch {
        return NextResponse.json(
          { error: "Source did not return valid JSON" },
          { status: 422 },
        );
      }
      const validation = validateConnectorFull(raw);
      if (!validation.valid) {
        return NextResponse.json(
          { error: "Fetched document failed validation", details: validation.errors },
          { status: 422 },
        );
      }

      const current = row.document as unknown as ConnectorDocument;
      const candidate = validation.document;
      const updateAvailable = candidate.version !== current.version;

      if (updateAvailable) {
        await prisma.connector.update({
          where: { id: row.id },
          data: {
            updateAvailable: {
              version: candidate.version,
              fetchedAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      }

      return NextResponse.json({
        updateAvailable,
        currentVersion: current.version,
        candidateVersion: candidate.version,
        candidate,
        // Host changes get red-highlight treatment in the diff UI
        hostsAdded: (candidate.allowedHosts ?? []).filter(
          (h) => !(current.allowedHosts ?? []).includes(h),
        ),
        hostsRemoved: (current.allowedHosts ?? []).filter(
          (h) => !(candidate.allowedHosts ?? []).includes(h),
        ),
      });
    }

    // apply_update — the exact candidate the admin reviewed, echoed back
    const updated = await installConnector(data.document, row.source, {
      sourceUrl: row.sourceUrl ?? undefined,
      replaceExisting: true,
    });
    return NextResponse.json({ connector: updated });
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
    throw error;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await findConnector(id);
  if (!row) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  // Removal is blocked while any ACTIVE grant has permissions bound here
  const bound = await prisma.resourcePermission.findMany({
    where: {
      resourceId: row.connectorId,
      status: "ACTIVE",
      grant: { status: "ACTIVE" },
    },
    select: { grant: { select: { id: true, document: true } } },
    distinct: ["grantId"],
  });

  if (bound.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot remove: ${bound.length} active grant(s) are bound to this connector. Revoke them first.`,
        grants: bound
          .filter((p) => p.grant)
          .map((p) => ({
            grantId: p.grant!.id,
            appName:
              (p.grant!.document as { app?: { name?: string } })?.app?.name ??
              "unknown",
          })),
      },
      { status: 409 },
    );
  }

  const keepCredentials =
    request.nextUrl.searchParams.get("keepCredentials") === "1";

  await prisma.connector.delete({ where: { id: row.id } });
  if (!keepCredentials) {
    await prisma.resourceSecret
      .delete({ where: { resourceId: row.connectorId } })
      .catch(() => {
        // No credentials stored — fine
      });
  }
  invalidateConnectorCache();

  return NextResponse.json({ success: true });
}
