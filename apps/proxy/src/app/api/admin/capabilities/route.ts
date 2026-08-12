import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { listResourceCapabilities } from "@/server/connectors/catalog";

// ============================================
// GET /api/admin/capabilities
// The services this gateway can grant, with the operations and limits
// each one can actually enforce. Read-only, owner-only.
//
// The approval screen gets this list server-side; the template editor
// is a client screen, so it fetches it from here.
// ============================================

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    capabilities: await listResourceCapabilities(),
  });
}
