// ============================================
// DURATION PRESETS
// Standardized permission duration options
// Used by both SDK (requesting) and Proxy (granting)
// ============================================

import { z } from "zod";

/**
 * Preset duration identifiers.
 * Apps can request these, and the proxy recognizes them.
 */
export type DurationPresetId =
  | "1_hour"
  | "4_hours"
  | "24_hours"
  | "1_week"
  | "1_month"
  | "3_months"
  | "1_year"
  | "forever"
  | "custom";

/**
 * Duration preset definition.
 */
export interface DurationPreset {
  id: DurationPresetId;
  label: string;
  description: string;
  /** Duration in milliseconds, null = never expires */
  durationMs: number | null;
  /** Suggested for short-term testing */
  isTemporary?: boolean;
  /** Suggested for production use */
  isRecommended?: boolean;
}

/**
 * All available duration presets in order of duration.
 */
export const DURATION_PRESETS: DurationPreset[] = [
  {
    id: "1_hour",
    label: "1 hour",
    description: "Quick testing session",
    durationMs: 60 * 60 * 1000,
    isTemporary: true,
  },
  {
    id: "4_hours",
    label: "4 hours",
    description: "Extended testing",
    durationMs: 4 * 60 * 60 * 1000,
    isTemporary: true,
  },
  {
    id: "24_hours",
    label: "24 hours",
    description: "One day access",
    durationMs: 24 * 60 * 60 * 1000,
    isTemporary: true,
  },
  {
    id: "1_week",
    label: "1 week",
    description: "7 days",
    durationMs: 7 * 24 * 60 * 60 * 1000,
  },
  {
    id: "1_month",
    label: "1 month",
    description: "30 days",
    durationMs: 30 * 24 * 60 * 60 * 1000,
    isRecommended: true,
  },
  {
    id: "3_months",
    label: "3 months",
    description: "90 days",
    durationMs: 90 * 24 * 60 * 60 * 1000,
    isRecommended: true,
  },
  {
    id: "1_year",
    label: "1 year",
    description: "365 days",
    durationMs: 365 * 24 * 60 * 60 * 1000,
  },
  {
    id: "forever",
    label: "Forever",
    description: "No expiration",
    durationMs: null,
  },
  {
    id: "custom",
    label: "Custom",
    description: "Set specific date/time",
    durationMs: null,
  },
];

/**
 * Get a preset by ID.
 */
export function getDurationPreset(
  id: DurationPresetId,
): DurationPreset | undefined {
  return DURATION_PRESETS.find((p) => p.id === id);
}

/**
 * Calculate expiry date from a duration preset ID.
 * @returns Date object or null for "forever"
 */
export function getExpiryFromDurationPreset(
  presetId: DurationPresetId,
  fromDate: Date = new Date(),
): Date | null {
  const preset = getDurationPreset(presetId);
  if (!preset || preset.durationMs === null) {
    return null;
  }
  return new Date(fromDate.getTime() + preset.durationMs);
}

/**
 * Calculate expiry date from a duration in milliseconds.
 */
export function getExpiryFromDuration(
  durationMs: number,
  fromDate: Date = new Date(),
): Date {
  return new Date(fromDate.getTime() + durationMs);
}

/**
 * Find the closest matching preset for a given duration.
 */
export function findClosestPreset(durationMs: number | null): DurationPreset {
  if (durationMs === null) {
    return DURATION_PRESETS.find((p) => p.id === "forever")!;
  }

  // Find closest match
  let closest = DURATION_PRESETS[0];
  let closestDiff = Infinity;

  for (const preset of DURATION_PRESETS) {
    if (preset.durationMs === null || preset.id === "custom") continue;

    const diff = Math.abs(preset.durationMs - durationMs);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = preset;
    }
  }

  return closest;
}

/**
 * Format a duration in milliseconds to human readable.
 */
export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "Forever";

  const hours = durationMs / (60 * 60 * 1000);
  if (hours < 24) return `${Math.round(hours)} hour${hours !== 1 ? "s" : ""}`;

  const days = hours / 24;
  if (days < 7) return `${Math.round(days)} day${days !== 1 ? "s" : ""}`;

  const weeks = days / 7;
  if (weeks < 4) return `${Math.round(weeks)} week${weeks !== 1 ? "s" : ""}`;

  const months = days / 30;
  if (months < 12)
    return `${Math.round(months)} month${months !== 1 ? "s" : ""}`;

  const years = days / 365;
  return `${Math.round(years)} year${years !== 1 ? "s" : ""}`;
}

/**
 * Format an expiry date relative to now.
 */
export function formatExpiryRelative(expiresAt: Date | null): string {
  if (!expiresAt) return "Never";

  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();

  if (diff <= 0) return "Expired";
  return `In ${formatDuration(diff)}`;
}

// ============================================
// ZOD SCHEMAS
// ============================================

/**
 * Duration preset ID schema for validation.
 */
export const DurationPresetIdSchema = z.enum([
  "1_hour",
  "4_hours",
  "24_hours",
  "1_week",
  "1_month",
  "3_months",
  "1_year",
  "forever",
  "custom",
]);

/**
 * Requested duration schema.
 * Apps can specify their preferred duration when requesting permissions.
 */
export const RequestedDurationSchema = z.union([
  // Preset ID
  z.object({
    type: z.literal("preset"),
    preset: DurationPresetIdSchema,
  }),
  // Specific duration in milliseconds
  z.object({
    type: z.literal("duration"),
    durationMs: z.number().int().positive(),
  }),
  // Specific expiry date
  z.object({
    type: z.literal("until"),
    expiresAt: z.string().datetime(),
  }),
]);

export type RequestedDuration = z.infer<typeof RequestedDurationSchema>;

/**
 * Resolve a RequestedDuration to an expiry Date (or null for forever).
 */
export function resolveRequestedDuration(
  duration: RequestedDuration | undefined,
  fromDate: Date = new Date(),
): Date | null {
  if (!duration) return null; // Default: no preference (admin decides)

  switch (duration.type) {
    case "preset":
      return getExpiryFromDurationPreset(duration.preset, fromDate);
    case "duration":
      return getExpiryFromDuration(duration.durationMs, fromDate);
    case "until":
      return new Date(duration.expiresAt);
  }
}

/**
 * Create a preset-based RequestedDuration.
 */
export function createPresetDuration(
  preset: DurationPresetId,
): RequestedDuration {
  return { type: "preset", preset };
}

/**
 * Create a duration-based RequestedDuration.
 */
export function createDurationMs(durationMs: number): RequestedDuration {
  return { type: "duration", durationMs };
}

/**
 * Create an until-based RequestedDuration.
 */
export function createUntilDuration(expiresAt: Date): RequestedDuration {
  return { type: "until", expiresAt: expiresAt.toISOString() };
}
