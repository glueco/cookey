import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ============================================
// OWNER NOTIFICATIONS
// In-app notification feed (bell in the admin header). Types:
// renewal_due | inactivity_suspend | claim_reuse | digest |
// connector_update | anomaly
// ============================================

export type NotificationType =
  | "renewal_due"
  | "inactivity_suspend"
  | "claim_reuse"
  | "digest"
  | "connector_update"
  | "anomaly";

export async function createNotification(
  type: NotificationType,
  title: string,
  body: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  await prisma.notification.create({
    data: {
      type,
      title,
      body,
      payload: payload ? (payload as Prisma.InputJsonValue) : undefined,
    },
  });
}

/**
 * Create a notification unless one with the same type and dedupe key
 * already exists — read OR unread. Deduping only against unread would
 * make a dismissed notification reappear on every cron re-run; the
 * dedupe keys themselves are period-scoped (grant+periodEnd, grant+day)
 * so genuinely new occurrences still notify.
 */
export async function createNotificationOnce(
  type: NotificationType,
  dedupeKey: string,
  title: string,
  body: string,
  payload?: Record<string, unknown>,
): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      type,
      payload: { path: ["dedupeKey"], equals: dedupeKey },
    },
    select: { id: true },
  });
  if (existing) return false;

  await createNotification(type, title, body, { ...payload, dedupeKey });
  return true;
}
