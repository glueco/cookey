import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAuth, checkOriginGate } from "@/server/auth/resolve";
import { getUsageSnapshot } from "@/server/limits/budget";
import { resolveConnector } from "@/server/connectors/registry";
import { createErrorResponse } from "@glueco/shared";
import { CORS_HEADERS, CORS_PREFLIGHT_HEADERS } from "@/lib/cors";

// ============================================
// GET /v1/grant (5.8)
// Returns what the app actually got: resolved resources, actions, models,
// constraints, and remaining budgets. Replaces per-provider guesswork and
// powers model pickers. Authed by bearer token or PoP.
// ============================================

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request, "");

  if (!auth.success) {
    return NextResponse.json(
      createErrorResponse(auth.error!.code, auth.error!.message),
      { status: auth.error!.status, headers: CORS_HEADERS },
    );
  }

  const grant = auth.grant!;

  const originError = checkOriginGate(request, grant);
  if (originError) {
    return NextResponse.json(
      createErrorResponse(originError.code, originError.message),
      { status: originError.status, headers: CORS_HEADERS },
    );
  }

  const permissions = await prisma.resourcePermission.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ grantId: grant.id }, { appId: grant.appId, grantId: null }],
    },
    orderBy: [{ resourceId: "asc" }, { action: "asc" }],
  });

  // Group permissions by resourceId
  const byResource = new Map<string, typeof permissions>();
  for (const permission of permissions) {
    const list = byResource.get(permission.resourceId) ?? [];
    list.push(permission);
    byResource.set(permission.resourceId, list);
  }

  const resources = await Promise.all(
    [...byResource.entries()].map(async ([resourceId, perms]) => {
      const constraints =
        (perms[0].constraints as Record<string, unknown> | null) ?? {};

      // models = provider models ∩ allowedModels (when set)
      const allowedModels = Array.isArray(constraints.allowedModels)
        ? (constraints.allowedModels as string[])
        : null;
      const providerModels =
        (await resolveConnector(resourceId))?.document.models ?? [];
      const models =
        allowedModels && allowedModels.length > 0
          ? allowedModels.filter(
              (m) =>
                providerModels.length === 0 || providerModels.includes(m),
            )
          : [...providerModels];

      const usage = await getUsageSnapshot(perms[0].id);
      const remaining: Record<string, number> = {};
      if (perms[0].dailyQuota) {
        remaining.dailyRequests = Math.max(
          0,
          perms[0].dailyQuota - usage.dailyRequests,
        );
      }
      if (perms[0].monthlyQuota) {
        remaining.monthlyRequests = Math.max(
          0,
          perms[0].monthlyQuota - usage.monthlyRequests,
        );
      }
      if (perms[0].dailyTokenBudget) {
        remaining.dailyTokens = Math.max(
          0,
          perms[0].dailyTokenBudget - usage.dailyTokens,
        );
      }
      if (perms[0].monthlyTokenBudget) {
        remaining.monthlyTokens = Math.max(
          0,
          perms[0].monthlyTokenBudget - usage.monthlyTokens,
        );
      }

      return {
        resourceId,
        actions: perms.map((p) => p.action),
        models,
        constraints,
        remaining,
      };
    }),
  );

  return NextResponse.json(
    {
      grantId: grant.id,
      status: grant.status,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
      currentPeriodEnd: grant.currentPeriodEnd?.toISOString() ?? null,
      auth: grant.authType === "POP" ? "pop" : "bearer",
      resources,
    },
    { headers: CORS_HEADERS },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_PREFLIGHT_HEADERS,
  });
}
