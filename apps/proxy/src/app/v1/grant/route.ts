import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  resolveAuth,
  checkOriginGate,
  checkGrantState,
} from "@/server/auth/resolve";
import { getGrantUsageSnapshot } from "@/server/limits/budget";
import { resolveConnector } from "@/server/connectors/registry";
import { ipMatchesList } from "@/lib/ip-match";
import { createErrorResponse, ErrorCode } from "@/shared";
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

  // Same gate order as the data plane (7.2): grant state → origin →
  // egress IPs. A suspended/expired grant or a request from outside the
  // pinned IP list must not read the resource map either.
  const stateError = checkGrantState(grant);
  if (stateError) {
    return NextResponse.json(
      createErrorResponse(stateError.code, stateError.message),
      { status: stateError.status, headers: CORS_HEADERS },
    );
  }

  const originError = checkOriginGate(request, grant);
  if (originError) {
    return NextResponse.json(
      createErrorResponse(originError.code, originError.message),
      { status: originError.status, headers: CORS_HEADERS },
    );
  }

  if (
    grant.egressIps &&
    (!auth.clientIp || !ipMatchesList(auth.clientIp, grant.egressIps))
  ) {
    return NextResponse.json(
      createErrorResponse(
        ErrorCode.ERR_PERMISSION_DENIED,
        "Request IP is not in this grant's egress allowlist",
      ),
      { status: 403, headers: CORS_HEADERS },
    );
  }

  const permissions = await prisma.resourcePermission.findMany({
    where: { grantId: grant.id, status: "ACTIVE" },
    orderBy: [{ resourceId: "asc" }, { action: "asc" }],
  });

  // Group permissions by resourceId
  const byResource = new Map<string, typeof permissions>();
  for (const permission of permissions) {
    const list = byResource.get(permission.resourceId) ?? [];
    list.push(permission);
    byResource.set(permission.resourceId, list);
  }

  // Budgets are grant-level (denormalized identically onto every
  // permission row), so remaining is computed against grant-wide usage.
  const usage = await getGrantUsageSnapshot(grant.id);

  const resources = await Promise.all(
    [...byResource.entries()].map(async ([resourceId, perms]) => {
      // Multiple grant requests may bind the same resource with
      // different constraints — report the tightest merge, not perms[0].
      const constraints = mergeConstraints(
        perms.map(
          (p) => (p.constraints as Record<string, unknown> | null) ?? {},
        ),
      );

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

/**
 * Merge permission constraint objects into the tightest combination:
 * numbers → min, booleans → AND, arrays → intersection (or the shorter
 * list when one side is missing), everything else → first defined.
 */
function mergeConstraints(
  all: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const constraints of all) {
    for (const [key, value] of Object.entries(constraints)) {
      const existing = merged[key];
      if (existing === undefined) {
        merged[key] = value;
      } else if (typeof existing === "number" && typeof value === "number") {
        merged[key] = Math.min(existing, value);
      } else if (typeof existing === "boolean" && typeof value === "boolean") {
        merged[key] = existing && value;
      } else if (Array.isArray(existing) && Array.isArray(value)) {
        merged[key] = existing.filter((v) => value.includes(v));
      }
    }
  }
  return merged;
}
