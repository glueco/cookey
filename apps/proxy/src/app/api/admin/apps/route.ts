import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@/lib/db";
import { z } from "zod";
import {
  getDailyRequestCount,
  getModelUsageByDay,
  summarizeUsage,
} from "@/server/stats/usage";
import { checkAdminAuth } from "@/lib/admin-auth";

// ============================================
// GET /api/admin/apps
// List all apps with full permission details
// ============================================

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apps = await prisma.app.findMany({
    include: {
      permissions: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          resourceId: true,
          action: true,
          constraints: true,
          validFrom: true,
          expiresAt: true,
          timeWindow: true,
          rateLimitRequests: true,
          rateLimitWindowSecs: true,
          burstLimit: true,
          burstWindowSecs: true,
          dailyQuota: true,
          monthlyQuota: true,
          dailyTokenBudget: true,
          monthlyTokenBudget: true,
          status: true,
          createdAt: true,
        },
      },
      limits: true,
      _count: {
        select: { requestLogs: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Enrich with usage data including model stats (SQL over RequestLog)
  const enrichedApps = await Promise.all(
    apps.map(async (app) => {
      const [dailyUsage, usageStats] = await Promise.all([
        getDailyRequestCount(app.id),
        getModelUsageByDay(app.id, 7),
      ]);

      return {
        ...app,
        dailyUsage,
        usageStats,
        usageSummary: summarizeUsage(usageStats),
      };
    }),
  );

  return NextResponse.json({ apps: enrichedApps });
}

// ============================================
// PATCH /api/admin/apps
// Update app status
// ============================================

const UpdateAppSchema = z.object({
  appId: z.string().min(1),
  status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
});

export async function PATCH(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateAppSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.errors },
      { status: 400 },
    );
  }

  const app = await prisma.app.update({
    where: { id: parsed.data.appId },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ app });
}

// ============================================
// PUT /api/admin/apps
// Update app details and permissions
// ============================================

const UpdatePermissionSchema = z.object({
  id: z.string(),
  expiresAt: z.string().datetime().nullable().optional(),
  rateLimitRequests: z.number().int().positive().nullable().optional(),
  rateLimitWindowSecs: z.number().int().positive().nullable().optional(),
  dailyQuota: z.number().int().positive().nullable().optional(),
  monthlyQuota: z.number().int().positive().nullable().optional(),
  dailyTokenBudget: z.number().int().positive().nullable().optional(),
  monthlyTokenBudget: z.number().int().positive().nullable().optional(),
  constraints: z.record(z.unknown()).nullable().optional(),
  status: z.enum(["ACTIVE", "REVOKED"]).optional(),
});

const UpdateAppDetailsSchema = z.object({
  appId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  permissions: z.array(UpdatePermissionSchema).optional(),
});

export async function PUT(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateAppDetailsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.errors },
      { status: 400 },
    );
  }

  const { appId, name, description, permissions } = parsed.data;

  // Update app details if provided
  if (name !== undefined || description !== undefined) {
    await prisma.app.update({
      where: { id: appId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
      },
    });
  }

  // Update permissions if provided
  if (permissions && permissions.length > 0) {
    for (const perm of permissions) {
      await prisma.resourcePermission.update({
        where: { id: perm.id },
        data: {
          ...(perm.expiresAt !== undefined && {
            expiresAt: perm.expiresAt ? new Date(perm.expiresAt) : null,
          }),
          ...(perm.rateLimitRequests !== undefined && {
            rateLimitRequests: perm.rateLimitRequests,
          }),
          ...(perm.rateLimitWindowSecs !== undefined && {
            rateLimitWindowSecs: perm.rateLimitWindowSecs,
          }),
          ...(perm.dailyQuota !== undefined && { dailyQuota: perm.dailyQuota }),
          ...(perm.monthlyQuota !== undefined && {
            monthlyQuota: perm.monthlyQuota,
          }),
          ...(perm.dailyTokenBudget !== undefined && {
            dailyTokenBudget: perm.dailyTokenBudget,
          }),
          ...(perm.monthlyTokenBudget !== undefined && {
            monthlyTokenBudget: perm.monthlyTokenBudget,
          }),
          ...(perm.constraints !== undefined && {
            constraints:
              perm.constraints === null
                ? Prisma.JsonNull
                : (perm.constraints as Prisma.InputJsonValue),
          }),
          ...(perm.status !== undefined && { status: perm.status }),
        },
      });
    }
  }

  // Return updated app
  const updatedApp = await prisma.app.findUnique({
    where: { id: appId },
    include: {
      permissions: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          resourceId: true,
          action: true,
          constraints: true,
          validFrom: true,
          expiresAt: true,
          timeWindow: true,
          rateLimitRequests: true,
          rateLimitWindowSecs: true,
          burstLimit: true,
          burstWindowSecs: true,
          dailyQuota: true,
          monthlyQuota: true,
          dailyTokenBudget: true,
          monthlyTokenBudget: true,
          status: true,
          createdAt: true,
        },
      },
      limits: true,
    },
  });

  return NextResponse.json({ app: updatedApp });
}

// ============================================
// DELETE /api/admin/apps
// Delete an app
// ============================================

export async function DELETE(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const appId = url.searchParams.get("appId");

  if (!appId) {
    return NextResponse.json({ error: "appId required" }, { status: 400 });
  }

  await prisma.app.delete({
    where: { id: appId },
  });

  return NextResponse.json({ success: true });
}
