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
 * Create a notification unless an unread one with the same type and
 * payload key already exists (prevents cron re-runs from spamming).
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
      readAt: null,
      payload: { path: ["dedupeKey"], equals: dedupeKey },
    },
    select: { id: true },
  });
  if (existing) return false;

  await createNotification(type, title, body, { ...payload, dedupeKey });
  return true;
}
