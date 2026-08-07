import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/lib/admin-auth";
import { setSetting, DEFAULT_MARKETPLACE_URL } from "@/server/settings";

// ============================================
// /api/admin/settings
// GET   — all settings (with defaults surfaced)
// PATCH — { key, value } upserts one setting, or
//         { settings: { key: value, ... } } upserts a batch (so the
//         settings form saves all-or-nothing instead of dying mid-loop)
// ============================================

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.setting.findMany();
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return NextResponse.json({
    settings,
    defaults: { marketplaceUrl: DEFAULT_MARKETPLACE_URL },
  });
}

// z.unknown() alone would accept a missing value and crash Prisma's
// required Json column — require serializable, defined values.
const SettingValueSchema = z
  .union([z.string(), z.number(), z.boolean(), z.record(z.unknown()), z.array(z.unknown()), z.null()])
  .refine((v) => v !== undefined, { message: "value is required" });

const PatchSchema = z.union([
  z.object({
    key: z.string().min(1).max(64),
    value: SettingValueSchema,
  }),
  z.object({
    settings: z.record(z.string().min(1).max(64), SettingValueSchema),
  }),
]);

export async function PATCH(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { key, value } or { settings: { ... } }" },
      { status: 400 },
    );
  }

  try {
    if ("settings" in parsed.data) {
      for (const [key, value] of Object.entries(parsed.data.settings)) {
        await setSetting(key, value);
      }
    } else {
      await setSetting(parsed.data.key, parsed.data.value);
    }
  } catch (error) {
    console.error("Settings save error:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
