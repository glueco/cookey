import { prisma } from "@/lib/db";
import { cleanupExpiredNonces } from "@/server/limits/nonce";
import { cleanupStaleRateCounters } from "@/server/limits/rate-limit";
import {
  createNotification,
  createNotificationOnce,
} from "@/server/notifications";

// ============================================
// SWEEP (shared by the hourly cron and the admin "run sweep" action)
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

  // 7. Delete expired short-lived rows
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
