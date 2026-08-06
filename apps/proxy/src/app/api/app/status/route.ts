import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CORS_HEADERS, CORS_PREFLIGHT_HEADERS } from "@/lib/cors";
import { authenticateRequest, getAuthErrorStatus } from "@/server/auth/pop";
import { createErrorResponse, ErrorCode } from "@glueco/shared";
import { listEnabledConnectors, resolveConnector } from "@/server/connectors/registry";
import type { PermissionStatus } from "@prisma/client";

// ============================================
// GET /api/app/status
// Authenticated endpoint for apps to query their permissions
// Returns: app info, granted permissions, available resources
// ============================================

export async function GET(request: NextRequest) {
  // Authenticate using PoP
  const authResult = await authenticateRequest(request, "");
  
  if (!authResult.success) {
    const status = getAuthErrorStatus(authResult.errorCode!);
    return NextResponse.json(
      createErrorResponse(authResult.errorCode!, authResult.error!),
      { status, headers: CORS_HEADERS }
    );
  }

  const appId = authResult.appId!;

  try {
    // Fetch app with permissions
    const app = await prisma.app.findUnique({
      where: { id: appId },
      include: {
        grant: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
            currentPeriodEnd: true,
            authType: true,
          },
        },
        permissions: {
          where: { 
            status: "ACTIVE" as PermissionStatus,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ]
          },
          select: {
            resourceId: true,
            action: true,
            expiresAt: true,
            constraints: true,
          }
        }
      }
    });

    if (!app) {
      return NextResponse.json(
        createErrorResponse(ErrorCode.ERR_APP_NOT_FOUND, "App not found"),
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Get all available resources from enabled connectors
    const allResources = (await listEnabledConnectors()).map((c) => ({
      resourceId: c.id,
    }));
    
    // Get configured resources (with API keys)
    const configuredSecrets = await prisma.resourceSecret.findMany({
      where: { status: "ACTIVE" },
      select: { resourceId: true }
    });
    const configuredIds = new Set(configuredSecrets.map(s => s.resourceId));

    // Group permissions by resourceId
    const permissionsByResource = new Map<string, { actions: string[], expiresAt: Date | null, constraints: unknown }>();
    for (const perm of app.permissions) {
      const existing = permissionsByResource.get(perm.resourceId);
      if (existing) {
        existing.actions.push(perm.action);
        // Use earliest expiry
        if (perm.expiresAt && (!existing.expiresAt || perm.expiresAt < existing.expiresAt)) {
          existing.expiresAt = perm.expiresAt;
        }
        // Merge constraints (use latest for now)
        if (perm.constraints) {
          existing.constraints = perm.constraints;
        }
      } else {
        permissionsByResource.set(perm.resourceId, {
          actions: [perm.action],
          expiresAt: perm.expiresAt,
          constraints: perm.constraints,
        });
      }
    }

    // Build available resources list
    const grantedResourceIds = new Set(app.permissions.map(p => p.resourceId));
    
    const availableResources = await Promise.all(allResources
      .filter(r => configuredIds.has(r.resourceId) && grantedResourceIds.has(r.resourceId))
      .map(async r => {
        const resourcePerms = permissionsByResource.get(r.resourceId);
        const [resourceType, provider] = r.resourceId.split(":");
        
        // Extract models from constraints if present
        const constraints = resourcePerms?.constraints as { allowedModels?: string[] } | null;
        
        // If allowedModels is set and non-empty, use it; otherwise the
        // connector's model catalog (wildcard: all models allowed)
        let models: string[] = [];
        if (constraints?.allowedModels && constraints.allowedModels.length > 0) {
          models = constraints.allowedModels;
        } else {
          const connector = await resolveConnector(r.resourceId);
          models = connector?.document.models ? [...connector.document.models] : [];
        }
        
        return {
          resourceId: r.resourceId,
          resourceType,
          provider,
          actions: resourcePerms?.actions || [],
          models,
          expiresAt: resourcePerms?.expiresAt?.toISOString() || null,
        };
      }));

    return NextResponse.json({
      appId: app.id,
      name: app.name,
      status: app.status,
      permissions: availableResources,
      // Grant state (additive — new in the grant migration)
      grant: app.grant
        ? {
            grantId: app.grant.id,
            status: app.grant.status,
            expiresAt: app.grant.expiresAt?.toISOString() ?? null,
            currentPeriodEnd:
              app.grant.currentPeriodEnd?.toISOString() ?? null,
            auth: app.grant.authType === "POP" ? "pop" : "bearer",
          }
        : null,
    }, { headers: CORS_HEADERS });

  } catch (error) {
    console.error("App status error:", error);
    return NextResponse.json(
      createErrorResponse(ErrorCode.ERR_INTERNAL, "Failed to fetch app status"),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_PREFLIGHT_HEADERS,
  });
}
