import { NextResponse } from "next/server";
import { CORS_HEADERS } from "@/lib/cors";
import { listEnabledConnectors } from "@/server/connectors/registry";

// ============================================
// GET /api/admin/models
// Returns available models for all enabled connectors
// ============================================

export async function GET() {
  try {
    const connectors = await listEnabledConnectors();

    const models: Record<string, string[]> = {};
    for (const connector of connectors) {
      if (connector.models && connector.models.length > 0) {
        models[connector.id] = [...connector.models];
      }
    }

    return NextResponse.json(models, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Failed to fetch models:", error);
    return NextResponse.json(
      { error: "Failed to fetch models" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
