import { NextRequest, NextResponse } from "next/server";
import { runSweep } from "@/server/cron/sweep";
import { logger } from "@/lib/logger";

// ============================================
// /api/cron/sweep (hourly)
// Authed by Authorization: Bearer ${CRON_SECRET}.
// See server/cron/sweep.ts for the work list.
// ============================================

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runSweep();
    logger.info("Cron sweep completed", results);
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    logger.errorWithStack(
      "Cron sweep failed",
      error instanceof Error ? error : new Error(String(error)),
    );
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}

// Vercel cron invokes GET; POST kept for manual triggering
export const GET = handle;
export const POST = handle;
