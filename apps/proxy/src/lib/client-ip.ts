import { NextRequest } from "next/server";

// ============================================
// CLIENT IP RESOLUTION
// Security controls (egress IP allowlists, claim-code rate limits) read
// this, so it must not trust client-appendable header positions.
//
// Header trust order:
//   1. x-vercel-forwarded-for — set by the Vercel edge, not spoofable.
//   2. x-real-ip              — set by the fronting proxy (nginx etc.).
//   3. x-forwarded-for LAST entry — the hop added by the nearest proxy.
//      The leftmost entry is attacker-controlled whenever a proxy
//      APPENDS to an inbound header instead of replacing it.
// ============================================

export function getClientIp(request: NextRequest): string | null {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded.split(",").map((e) => e.trim()).filter(Boolean);
    const last = entries[entries.length - 1];
    if (last) return last;
  }

  return null;
}
