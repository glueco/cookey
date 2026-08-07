import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { encryptSecret } from "@/lib/vault";
import { checkAdminAuth } from "@/lib/admin-auth";

// ============================================
// GET /api/admin/resources
// List all resources
// ============================================

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resources = await prisma.resourceSecret.findMany({
    select: {
      id: true,
      resourceId: true,
      name: true,
      resourceType: true,
      status: true,
      config: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ resources });
}

// ============================================
// POST /api/admin/resources
// Create/update a resource secret.
// On UPDATE the secret is optional (blank = keep the stored key) and
// omitted config keys are merged over the stored config — re-saving a
// key must not wipe non-secret fields like `organization`.
// ============================================

const ResourceSchema = z.object({
  resourceId: z.string().min(1), // Format: resourceType:provider (e.g., llm:groq)
  name: z.string().min(1),
  resourceType: z.string().min(1),
  secret: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ResourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.errors },
      { status: 400 },
    );
  }

  // Validate resource ID format
  if (!parsed.data.resourceId.includes(":")) {
    return NextResponse.json(
      {
        error: `Invalid resourceId format: ${parsed.data.resourceId}. Expected format: resourceType:provider (e.g., llm:groq)`,
      },
      { status: 400 },
    );
  }

  const existing = await prisma.resourceSecret.findUnique({
    where: { resourceId: parsed.data.resourceId },
    select: { config: true },
  });

  const secretProvided = Boolean(parsed.data.secret?.trim());
  if (!existing && !secretProvided) {
    return NextResponse.json(
      { error: "An API key is required when adding credentials" },
      { status: 400 },
    );
  }

  const encrypted = secretProvided
    ? encryptSecret(parsed.data.secret!)
    : null;

  // Merge new config over stored config so partial saves keep fields
  const mergedConfig = {
    ...((existing?.config as Record<string, unknown> | null) ?? {}),
    ...(parsed.data.config ?? {}),
  };

  const resource = await prisma.resourceSecret.upsert({
    where: { resourceId: parsed.data.resourceId },
    create: {
      resourceId: parsed.data.resourceId,
      name: parsed.data.name,
      resourceType: parsed.data.resourceType,
      encryptedKey: encrypted!.encryptedKey,
      keyIv: encrypted!.keyIv,
      config: mergedConfig as object,
    },
    update: {
      name: parsed.data.name,
      resourceType: parsed.data.resourceType,
      // Blank secret on update = keep the stored key
      ...(encrypted && {
        encryptedKey: encrypted.encryptedKey,
        keyIv: encrypted.keyIv,
      }),
      config: mergedConfig as object,
    },
    select: {
      id: true,
      resourceId: true,
      name: true,
      resourceType: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ resource });
}

// ============================================
// DELETE /api/admin/resources
// Delete a resource by resourceId
// ============================================

export async function DELETE(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const resourceId = searchParams.get("resourceId");

  if (!resourceId) {
    return NextResponse.json(
      { error: "resourceId query parameter is required" },
      { status: 400 },
    );
  }

  // Check if resource exists
  const existing = await prisma.resourceSecret.findUnique({
    where: { resourceId },
  });

  if (!existing) {
    return NextResponse.json(
      { error: `Resource '${resourceId}' not found` },
      { status: 404 },
    );
  }

  // Delete the resource
  await prisma.resourceSecret.delete({
    where: { resourceId },
  });

  return NextResponse.json({
    success: true,
    message: `Resource '${resourceId}' deleted successfully`,
  });
}
