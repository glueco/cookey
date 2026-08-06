import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { checkAdminAuth } from "@/lib/admin-auth";

// ============================================
// /api/admin/templates — GrantTemplate CRUD (5.6)
// values holds any subset of approval-screen decisions; applying a
// template overwrites the form, fields stay editable after.
// ============================================

const STARTER_TEMPLATES = [
  {
    name: "Trusted app",
    description: "30 days, renewable, generous budgets.",
    values: {
      auth: "bearer",
      durationMs: 30 * 24 * 60 * 60 * 1000,
      renewal: { periodDays: 30 },
      budget: { dailyRequests: 2000, dailyTokens: 1_000_000 },
      inactivitySuspendDays: 30,
      allowBrowser: false,
    },
  },
  {
    name: "Demo / cheap tier",
    description: "7 days, static, tight budgets.",
    values: {
      auth: "bearer",
      durationMs: 7 * 24 * 60 * 60 * 1000,
      renewal: null,
      budget: { dailyRequests: 100, dailyTokens: 50_000 },
      inactivitySuspendDays: 7,
      allowBrowser: false,
    },
  },
];

async function ensureStarterTemplates(): Promise<void> {
  const count = await prisma.grantTemplate.count();
  if (count > 0) return;
  for (const template of STARTER_TEMPLATES) {
    await prisma.grantTemplate.upsert({
      where: { name: template.name },
      create: {
        name: template.name,
        description: template.description,
        values: template.values as Prisma.InputJsonValue,
      },
      update: {},
    });
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureStarterTemplates();
  const templates = await prisma.grantTemplate.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ templates });
}

const TemplateSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  values: z.record(z.unknown()),
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

  const parsed = TemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { name, description?, values }" },
      { status: 400 },
    );
  }

  const template = await prisma.grantTemplate.upsert({
    where: { name: parsed.data.name },
    create: {
      name: parsed.data.name,
      description: parsed.data.description,
      values: parsed.data.values as Prisma.InputJsonValue,
    },
    update: {
      description: parsed.data.description,
      values: parsed.data.values as Prisma.InputJsonValue,
    },
  });
  return NextResponse.json({ template });
}

export async function DELETE(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  try {
    await prisma.grantTemplate.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
