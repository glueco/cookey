import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ============================================
// GATEWAY SETTINGS
// Simple key-value store for owner-configurable values.
// ============================================

export const DEFAULT_MARKETPLACE_URL =
  "https://raw.githubusercontent.com/glueco/connectors/main/registry.json";

export const DEFAULT_INACTIVITY_SUSPEND_DAYS = 14;

export const SETTING_KEYS = {
  marketplaceUrl: "marketplaceUrl",
  gatewayName: "gatewayName",
  inactivitySuspendDaysDefault: "inactivitySuspendDaysDefault",
  digestEnabled: "digestEnabled",
  digestMailConnector: "digestMailConnector",
  digestMailTo: "digestMailTo",
  digestMailFrom: "digestMailFrom",
  autoSuspendOnAnomaly: "autoSuspendOnAnomaly",
} as const;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  return row.value as T;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue },
    update: { value: value as Prisma.InputJsonValue },
  });
}

export async function getMarketplaceUrl(): Promise<string> {
  return getSetting(SETTING_KEYS.marketplaceUrl, DEFAULT_MARKETPLACE_URL);
}

export const DEFAULT_GATEWAY_NAME = "Cookey Gateway";

export async function getGatewayName(): Promise<string> {
  const value = await getSetting<unknown>(
    SETTING_KEYS.gatewayName,
    DEFAULT_GATEWAY_NAME,
  );
  return typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_GATEWAY_NAME;
}

export async function getInactivitySuspendDaysDefault(): Promise<number> {
  const value = await getSetting<unknown>(
    SETTING_KEYS.inactivitySuspendDaysDefault,
    DEFAULT_INACTIVITY_SUSPEND_DAYS,
  );
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : DEFAULT_INACTIVITY_SUSPEND_DAYS;
}
