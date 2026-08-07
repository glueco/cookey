import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { safeFetch } from "@/lib/safe-fetch";
import { validateConnectorFull, semverGt } from "@/server/connectors/registry";
import { createNotificationOnce } from "@/server/notifications";
import type { ConnectorDocument } from "@/server/connectors/schema";
import { logger } from "@/lib/logger";

// ============================================
// /api/cron/connector-updates (daily)
// For REGISTRY/URL connectors: fetch the source, record updateAvailable
// when the version changed, notify. NEVER auto-applies — updates always
// go through the review + re-approval flow.
// ============================================

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidates = await prisma.connector.findMany({
    where: {
      source: { in: ["REGISTRY", "URL"] },
      sourceUrl: { not: null },
    },
  });

  let checked = 0;
  let updatesFound = 0;

  for (const row of candidates) {
    checked++;
    try {
      const fetched = await safeFetch(row.sourceUrl!);
      if (fetched.status !== 200) continue;
      const validation = validateConnectorFull(JSON.parse(fetched.text));
      if (!validation.valid) continue;

      const current = row.document as unknown as ConnectorDocument;
      const candidate = validation.document;
      // The source must still serve the SAME connector, and only a
      // strictly higher version counts as an update (spec 4.4) — a
      // downgraded or swapped-out document is not offered for approval.
      if (candidate.id !== row.connectorId) continue;
      if (!semverGt(candidate.version, current.version)) continue;

      updatesFound++;
      await prisma.connector.update({
        where: { id: row.id },
        data: {
          updateAvailable: {
            version: candidate.version,
            fetchedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      await createNotificationOnce(
        "connector_update",
        `connector-update:${row.connectorId}:${candidate.version}`,
        `${current.name} v${candidate.version} available`,
        `An update for the "${current.name}" connector (${row.connectorId}) is available: v${current.version} → v${candidate.version}. Review and approve it from the connector page — updates are never applied automatically.`,
        { connectorId: row.connectorId },
      );
    } catch {
      // Source unreachable — try again tomorrow
    }
  }

  logger.info("Connector update check completed", { checked, updatesFound });
  return NextResponse.json({ ok: true, checked, updatesFound });
}

export const GET = handle;
export const POST = handle;
