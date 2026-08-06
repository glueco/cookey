import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { createNotification } from "@/server/notifications";
import { getSetting, SETTING_KEYS } from "@/server/settings";
import { resolveConnector } from "@/server/connectors/registry";
import { decryptSecret } from "@/lib/vault";
import { logger } from "@/lib/logger";

// ============================================
// /api/cron/digest (weekly)
// Per-grant usage digest: requests, tokens, est. cost, last-active,
// last IP. Always lands as a Notification; also emailed when a mail
// connector is configured in Settings → Notifications.
// ============================================

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

interface DigestRow {
  appName: string;
  requests: number;
  tokens: number;
  cost: number;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
}

async function buildDigest(): Promise<DigestRow[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const grants = await prisma.grant.findMany({
    where: { status: { in: ["ACTIVE", "SUSPENDED_INACTIVITY", "SUSPENDED_ANOMALY", "SUSPENDED_MANUAL"] } },
    select: { id: true, document: true, lastUsedAt: true, lastUsedIp: true },
  });

  const rows: DigestRow[] = [];
  for (const grant of grants) {
    const stats = await prisma.$queryRaw<
      Array<{ requests: bigint; tokens: bigint | null; cost: number | null }>
    >(Prisma.sql`
      SELECT
        COUNT(*) AS "requests",
        SUM(COALESCE(("metadata"->>'totalTokens')::bigint, 0)) AS "tokens",
        SUM(COALESCE("costEstimate", 0)) AS "cost"
      FROM "RequestLog"
      WHERE "grantId" = ${grant.id}
        AND "decision" = 'ALLOWED'
        AND "timestamp" >= ${weekAgo}
    `);
    const stat = stats[0];
    rows.push({
      appName:
        (grant.document as { app?: { name?: string } })?.app?.name ?? grant.id,
      requests: Number(stat?.requests ?? 0),
      tokens: Number(stat?.tokens ?? 0),
      cost: Number(stat?.cost ?? 0),
      lastUsedAt: grant.lastUsedAt,
      lastUsedIp: grant.lastUsedIp,
    });
  }
  return rows.sort((a, b) => b.requests - a.requests);
}

function digestText(rows: DigestRow[]): string {
  if (rows.length === 0) return "No grants saw traffic this week.";
  return rows
    .map(
      (row) =>
        `${row.appName}: ${row.requests} requests, ${row.tokens} tokens, ≈$${row.cost.toFixed(2)}` +
        (row.lastUsedAt
          ? ` — last active ${row.lastUsedAt.toISOString().slice(0, 16)}${row.lastUsedIp ? ` from ${row.lastUsedIp}` : ""}`
          : " — never used"),
    )
    .join("\n");
}

/** Email the digest through a configured mail connector's real adapter path. */
async function emailDigest(body: string): Promise<boolean> {
  const connectorId = await getSetting<string>(SETTING_KEYS.digestMailConnector, "");
  const to = await getSetting<string>(SETTING_KEYS.digestMailTo, "");
  const from = await getSetting<string>(SETTING_KEYS.digestMailFrom, "");
  if (!connectorId || !to || !from) return false;

  const resolved = await resolveConnector(connectorId);
  const secretRow = await prisma.resourceSecret.findUnique({
    where: { resourceId: connectorId },
  });
  if (!resolved || !secretRow || secretRow.status !== "ACTIVE") return false;

  const sendAction = Object.entries(resolved.document.actions).find(([id]) =>
    id.includes("send"),
  );
  if (!sendAction) return false;

  const secret = decryptSecret({
    encryptedKey: secretRow.encryptedKey,
    keyIv: secretRow.keyIv,
  });

  try {
    const built = resolved.adapter.buildRequest(
      sendAction[1],
      {
        from,
        to,
        subject: "Cookey weekly digest",
        text: body,
      },
      {
        secret,
        credentials: { apiKey: secret },
        config: resolved.document.config,
        connector: resolved.document,
      },
      { stream: false },
    );
    const targetHost = new URL(built.url).hostname.toLowerCase();
    if (!(resolved.document.allowedHosts ?? []).map((h) => h.toLowerCase()).includes(targetHost)) {
      return false;
    }
    const response = await fetch(built.url, {
      method: built.method,
      headers: built.headers,
      ...(built.body !== undefined && { body: built.body }),
    });
    return response.ok;
  } catch (error) {
    logger.warn("Digest email failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enabled = await getSetting<boolean>(SETTING_KEYS.digestEnabled, false);
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: "digest disabled" });
  }

  const rows = await buildDigest();
  const body = digestText(rows);

  await createNotification(
    "digest",
    "Weekly usage digest",
    body,
    { rows: rows.length },
  );
  const emailed = await emailDigest(body);

  logger.info("Digest cron completed", { grants: rows.length, emailed });
  return NextResponse.json({ ok: true, grants: rows.length, emailed });
}

export const GET = handle;
export const POST = handle;
