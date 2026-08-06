import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { runSweep } from "@/server/cron/sweep";

// ============================================
// POST /api/admin/sweep
// Manual trigger of the housekeeping sweep from the dashboard
// (same work as the hourly cron, behind admin auth).
// ============================================

export async function POST(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runSweep();
  return NextResponse.json({ ok: true, results });
}
