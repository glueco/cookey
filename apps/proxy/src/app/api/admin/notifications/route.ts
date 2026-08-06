import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/lib/admin-auth";

// ============================================
// GET /api/admin/notifications
// Owner notification feed (bell). ?unread=1 filters to unread.
// ============================================

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unreadOnly = request.nextUrl.searchParams.get("unread") === "1";

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: unreadOnly ? { readAt: null } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({ where: { readAt: null } }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
