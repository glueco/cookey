import { prisma } from "@/lib/db";
import type { ResourcePermission } from "@prisma/client";

// ============================================
// ACCESS POLICY ENFORCEMENT
// Time-based permission validity: validFrom / expiresAt / timeWindow.
// Rate limits and quotas live in server/limits/*; body-level constraints
// are enforced by the gateway enforcement engine.
// ============================================

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Check a permission's time-based validity.
 * Returns { allowed: true } if the request should proceed.
 */
export function checkPermissionValidity(
  permission: ResourcePermission,
): PolicyCheckResult {
  const now = new Date();

  // Check validFrom (not yet active)
  if (permission.validFrom && now < permission.validFrom) {
    return {
      allowed: false,
      code: "NOT_YET_VALID",
      reason: `Permission not yet valid. Starts at ${permission.validFrom.toISOString()}`,
      details: { validFrom: permission.validFrom.toISOString() },
    };
  }

  // Check expiresAt (expired)
  if (permission.expiresAt && now > permission.expiresAt) {
    // Mark permission as expired in DB (async, don't wait)
    markPermissionExpired(permission.id).catch(console.error);

    return {
      allowed: false,
      code: "EXPIRED",
      reason: `Permission expired at ${permission.expiresAt.toISOString()}`,
      details: { expiresAt: permission.expiresAt.toISOString() },
    };
  }

  // Check time window (restricted hours)
  if (permission.timeWindow) {
    const windowResult = checkTimeWindow(
      permission.timeWindow as unknown as TimeWindowConfig,
    );
    if (!windowResult.allowed) {
      return windowResult;
    }
  }

  return { allowed: true };
}

// ============================================
// TIME WINDOW CHECK
// ============================================

export interface TimeWindowConfig {
  startHour: number;
  endHour: number;
  timezone: string;
  allowedDays?: number[];
}

export function checkTimeWindow(window: TimeWindowConfig): PolicyCheckResult {
  const now = new Date();

  // Get current time in the specified timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: window.timezone,
  });
  const currentHour = parseInt(formatter.format(now), 10);

  const currentDay = now.getDay();

  // Check allowed days
  if (window.allowedDays && window.allowedDays.length > 0) {
    if (!window.allowedDays.includes(currentDay)) {
      const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      return {
        allowed: false,
        code: "DAY_NOT_ALLOWED",
        reason: `Access not allowed on ${dayNames[currentDay]}`,
        details: { currentDay, allowedDays: window.allowedDays },
      };
    }
  }

  // Check time window
  let inWindow: boolean;
  if (window.startHour <= window.endHour) {
    // Normal window (e.g., 9:00-17:00)
    inWindow = currentHour >= window.startHour && currentHour < window.endHour;
  } else {
    // Overnight window (e.g., 22:00-06:00)
    inWindow = currentHour >= window.startHour || currentHour < window.endHour;
  }

  if (!inWindow) {
    return {
      allowed: false,
      code: "OUTSIDE_TIME_WINDOW",
      reason: `Access only allowed between ${window.startHour}:00-${window.endHour}:00 ${window.timezone}`,
      details: {
        currentHour,
        startHour: window.startHour,
        endHour: window.endHour,
        timezone: window.timezone,
      },
    };
  }

  return { allowed: true };
}

// ============================================
// HELPERS
// ============================================

async function markPermissionExpired(permissionId: string): Promise<void> {
  try {
    await prisma.resourcePermission.update({
      where: { id: permissionId },
      data: { status: "EXPIRED" },
    });
  } catch (error) {
    console.error("Failed to mark permission as expired:", error);
  }
}
