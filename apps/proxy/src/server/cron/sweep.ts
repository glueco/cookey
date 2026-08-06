import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getSetting, SETTING_KEYS } from "@/server/settings";
import { cleanupExpiredNonces } from "@/server/limits/nonce";
import { cleanupStaleRateCounters } from "@/server/limits/rate-limit";
import {
  createNotification,
  createNotificationOnce,
} from "@/server/notifications";

// ============================================
// SWEEP (shared by the daily cron and the admin "run sweep" action)
// - expire grants past expiresAt / past their renewal period
// - expire permissions past expiresAt
// - suspend inactive grants (inactivitySuspendDays)
// - renewal-due notifications (T-3 days), one per grant+period
// - prune expired PopNonce / ClaimCode / ConnectCode rows
// - prune stale RateCounter windows and stale PENDING grants
// ============================================

const RENEWAL_NOTICE_DAYS = 3;
const PENDING_GRANT_MAX_AGE_DAYS = 7;
// RateCounter rows are keyed by window start; nothing looks at windows
// older than 2× the largest plausible window, so a 2-day cutoff is safe.
const RATE_COUNTER_MAX_AGE_SECONDS = 2 * 24 * 60 * 60;

export async function runSweep() {
  const now = new Date();
  const results: Record<string, number> = {};

  // 1. Expire grants past their hard expiry
  results.grantsExpired = (
    await prisma.grant.updateMany({
      where: {
        status: "ACTIVE",
        expiresAt: { lt: now },
      },
      data: { status: "EXPIRED" },
    })
  ).count;

  // 2. Expire renewable grants whose period lapsed without renewal
  results.periodsExpired = (
    await prisma.grant.updateMany({
      where: {
        status: "ACTIVE",
        currentPeriodEnd: { lt: now },
      },
      data: { status: "EXPIRED" },
    })
  ).count;

  // 3. Expire permissions past due (preserves pre-grant expiry semantics)
  results.permissionsExpired = (
    await prisma.resourcePermission.updateMany({
      where: { status: "ACTIVE", expiresAt: { lt: now } },
      data: { status: "EXPIRED" },
    })
  ).count;

  // 4. Inactivity suspension
  const inactivityCandidates = await prisma.grant.findMany({
    where: {
      status: "ACTIVE",
      inactivitySuspendDays: { gt: 0 },
    },
    select: {
      id: true,
      approvedAt: true,
      lastUsedAt: true,
      inactivitySuspendDays: true,
      document: true,
    },
  });

  let suspended = 0;
  for (const grant of inactivityCandidates) {
    const reference = grant.lastUsedAt ?? grant.approvedAt;
    if (!reference) continue;
    const idleMs = now.getTime() - reference.getTime();
    const limitMs = grant.inactivitySuspendDays! * 24 * 60 * 60 * 1000;
    if (idleMs > limitMs) {
      await prisma.grant.update({
        where: { id: grant.id },
        data: { status: "SUSPENDED_INACTIVITY" },
      });
      const name = grantAppName(grant.document);
      await createNotification(
        "inactivity_suspend",
        `${name} suspended for inactivity`,
        `"${name}" made no requests for ${grant.inactivitySuspendDays} days and was suspended. Reactivate it from the grant page if this is expected.`,
        { grantId: grant.id },
      );
      suspended++;
    }
  }
  results.grantsSuspendedInactivity = suspended;

  // 5. Renewal-due notifications (T-3 days before period end)
  const renewalCutoff = new Date(
    now.getTime() + RENEWAL_NOTICE_DAYS * 24 * 60 * 60 * 1000,
  );
  const renewalDue = await prisma.grant.findMany({
    where: {
      status: "ACTIVE",
      renewalPeriodDays: { not: null },
      currentPeriodEnd: { gt: now, lt: renewalCutoff },
    },
    select: { id: true, currentPeriodEnd: true, document: true },
  });

  let renewalNotices = 0;
  for (const grant of renewalDue) {
    const name = grantAppName(grant.document);
    const endDate = grant.currentPeriodEnd!.toISOString().slice(0, 10);
    const created = await createNotificationOnce(
      "renewal_due",
      `renewal:${grant.id}:${endDate}`,
      `${name}'s access expires soon — renew?`,
      `"${name}" reaches the end of its access period on ${endDate}. Renew from the grant page to extend it; otherwise it expires automatically.`,
      { grantId: grant.id },
    );
    if (created) renewalNotices++;
  }
  results.renewalNotices = renewalNotices;

  // 6. Expire stale PENDING grants (housekeeping)
  const pendingCutoff = new Date(
    now.getTime() - PENDING_GRANT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
  );
  results.stalePendingExpired = (
    await prisma.grant.updateMany({
      where: { status: "PENDING", createdAt: { lt: pendingCutoff } },
      data: { status: "EXPIRED" },
    })
  ).count;

  // 7. Anomaly detection (7.3): a grant exceeding 3× its trailing-7-day
  // daily average today gets a notification (auto-suspend is opt-in).
  // The floor avoids flagging idle grants on their first busy day.
  const ANOMALY_MULTIPLIER = 3;
  const ANOMALY_MIN_AVERAGE = 10;
  const autoSuspend = await getSetting<boolean>(
    SETTING_KEYS.autoSuspendOnAnomaly,
    false,
  );

  const anomalyRows = await prisma.$queryRaw<
    Array<{ grantId: string; today: bigint; avg7: number }>
  >(Prisma.sql`
    SELECT
      "grantId",
      COUNT(*) FILTER (WHERE "timestamp" >= date_trunc('day', NOW())) AS "today",
      COUNT(*) FILTER (
        WHERE "timestamp" >= NOW() - interval '8 days'
          AND "timestamp" < date_trunc('day', NOW())
      ) / 7.0 AS "avg7"
    FROM "RequestLog"
    WHERE "grantId" IS NOT NULL
      AND "timestamp" >= NOW() - interval '8 days'
    GROUP BY "grantId"
  `);

  let anomalies = 0;
  for (const row of anomalyRows) {
    const today = Number(row.today);
    const avg = Number(row.avg7);
    if (avg < ANOMALY_MIN_AVERAGE || today <= avg * ANOMALY_MULTIPLIER) continue;

    const grant = await prisma.grant.findUnique({
      where: { id: row.grantId },
      select: { id: true, status: true, document: true, lastUsedIp: true },
    });
    if (!grant || grant.status !== "ACTIVE") continue;

    const name = grantAppName(grant.document);
    const created = await createNotificationOnce(
      "anomaly",
      `anomaly:${grant.id}:${now.toISOString().slice(0, 10)}`,
      `Unusual traffic from ${name}`,
      `"${name}" made ${today} requests today — over ${ANOMALY_MULTIPLIER}× its trailing average of ${avg.toFixed(0)}/day` +
        (grant.lastUsedIp ? ` (last IP ${grant.lastUsedIp})` : "") +
        (autoSuspend
          ? ". The grant was auto-suspended per your settings."
          : ". Review the grant if this is unexpected."),
      { grantId: grant.id },
    );
    if (created) {
      anomalies++;
      if (autoSuspend) {
        await prisma.grant.update({
          where: { id: grant.id },
          data: { status: "SUSPENDED_ANOMALY" },
        });
      }
    }
  }
  results.anomaliesFlagged = anomalies;

  // 8. Delete expired short-lived rows
  results.noncesDeleted = await cleanupExpiredNonces();
  results.claimCodesDeleted = (
    await prisma.claimCode.deleteMany({ where: { expiresAt: { lt: now } } })
  ).count;
  results.connectCodesDeleted = (
    await prisma.connectCode.deleteMany({ where: { expiresAt: { lt: now } } })
  ).count;
  results.rateCountersDeleted = await cleanupStaleRateCounters(
    RATE_COUNTER_MAX_AGE_SECONDS,
  );

  return results;
}


function grantAppName(document: unknown): string {
  const doc = document as { app?: { name?: string } } | null;
  return doc?.app?.name ?? "An app";
}
