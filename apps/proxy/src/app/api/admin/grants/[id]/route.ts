import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/lib/admin-auth";
import {
  approveGrant,
  denyGrant,
  revokeGrant,
  renewGrant,
  setGrantSuspended,
  regenerateToken,
  GrantServiceError,
} from "@/server/grants/service";
import { GrantDecisionsSchema } from "@/server/grants/schema";
import { getDisplayableToken } from "@/server/grants/tokens";
import { getUsageSnapshot } from "@/server/limits/budget";

// ============================================
// /api/admin/grants/[id]
// GET   — grant detail: frozen document, decisions, permissions + usage,
//         token panel (displayable token during copy-paste window)
// PATCH — { action: approve|deny|revoke|renew|suspend|reactivate|
//           regenerate_token, decisions? }
// ============================================

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const grant = await prisma.grant.findUnique({
    where: { id },
    include: {
      app: true,
      tokens: { orderBy: { createdAt: "desc" } },
      permissions: true,
    },
  });

  if (!grant) {
    return NextResponse.json({ error: "Grant not found" }, { status: 404 });
  }

  const permissionsWithUsage = await Promise.all(
    grant.permissions.map(async (permission) => ({
      ...permission,
      usage: await getUsageSnapshot(permission.id),
    })),
  );

  const auditTail = await prisma.requestLog.findMany({
    where: { OR: [{ grantId: id }, { appId: grant.appId }] },
    orderBy: { timestamp: "desc" },
    take: 25,
  });

  return NextResponse.json({
    grant: {
      ...grant,
      permissions: permissionsWithUsage,
      tokens: grant.tokens.map((token) => ({
        id: token.id,
        displayPrefix: token.displayPrefix,
        expiresAt: token.expiresAt,
        revokedAt: token.revokedAt,
        firstUsedAt: token.firstUsedAt,
        lastUsedAt: token.lastUsedAt,
        lastUsedIp: token.lastUsedIp,
        createdAt: token.createdAt,
        // Copy-paste window: plaintext available only pre-first-use
        displayableToken: getDisplayableToken(token),
      })),
    },
    auditTail,
  });
}

const PatchSchema = z.object({
  action: z.enum([
    "approve",
    "deny",
    "revoke",
    "renew",
    "suspend",
    "reactivate",
    "regenerate_token",
  ]),
  decisions: GrantDecisionsSchema.optional(),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.errors },
      { status: 400 },
    );
  }

  try {
    switch (parsed.data.action) {
      case "approve": {
        if (!parsed.data.decisions) {
          return NextResponse.json(
            { error: "decisions required for approval" },
            { status: 400 },
          );
        }
        const result = await approveGrant(id, parsed.data.decisions, {
          gatewayUrl: request.nextUrl.origin,
        });
        return NextResponse.json({
          grant: result.grant,
          ...(result.token && { token: result.token }),
          ...(result.redirectUrl && { redirectUrl: result.redirectUrl }),
        });
      }
      case "deny":
        return NextResponse.json({ grant: await denyGrant(id) });
      case "revoke":
        return NextResponse.json({ grant: await revokeGrant(id) });
      case "renew":
        return NextResponse.json({ grant: await renewGrant(id) });
      case "suspend":
        return NextResponse.json({ grant: await setGrantSuspended(id, true) });
      case "reactivate":
        return NextResponse.json({ grant: await setGrantSuspended(id, false) });
      case "regenerate_token": {
        const token = await regenerateToken(id);
        return NextResponse.json({ token });
      }
    }
  } catch (error) {
    if (error instanceof GrantServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Grant action error:", error);
    return NextResponse.json(
      { error: "Failed to update grant" },
      { status: 500 },
    );
  }
}
