import { NextRequest } from "next/server";

// ============================================
// CLIENT IP RESOLUTION
// Vercel (and most proxies) set x-forwarded-for; the leftmost entry is
// the original client.
// ============================================

export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}
