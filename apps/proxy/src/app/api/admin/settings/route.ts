import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/lib/admin-auth";
import { setSetting, DEFAULT_MARKETPLACE_URL } from "@/server/settings";

// ============================================
// /api/admin/settings
// GET   — all settings (with defaults surfaced)
// PATCH — { key, value } upserts one setting
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

const PatchSchema = z.object({
  key: z.string().min(1).max(64),
  value: z.unknown(),
});

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
      { error: "Expected { key, value }" },
      { status: 400 },
    );
  }

  await setSetting(parsed.data.key, parsed.data.value);
  return NextResponse.json({ success: true });
}
