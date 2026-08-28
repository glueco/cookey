import { NextResponse } from "next/server";
import { listEnabledConnectors } from "@/server/connectors/registry";
import { prisma } from "@/lib/db";
import type { ResourcesDiscoveryResponse } from "@/shared";
import { CORS_HEADERS, CORS_PREFLIGHT_HEADERS } from "@/lib/cors";

// ============================================
// GET /api/resources
// Public discovery endpoint — generated from enabled connectors,
// filtered to those with configured credentials.
// ============================================

const GATEWAY_VERSION = "2.0.0";
const GATEWAY_NAME = "Cookey Gateway";

export async function GET() {
  const [connectors, configuredSecrets] = await Promise.all([
    listEnabledConnectors(),
    prisma.resourceSecret.findMany({
      where: { status: "ACTIVE" },
      select: { resourceId: true },
    }),
  ]);
  const configuredIds = new Set(configuredSecrets.map((s) => s.resourceId));

  const resources = connectors
    .filter((connector) => configuredIds.has(connector.id))
    .map((connector) => ({
      resourceId: connector.id,
      actions: Object.keys(connector.actions),
      auth: { pop: { version: 1 } },
      version: connector.version,
      constraints: {
        supports: [
          ...new Set(
            Object.values(connector.actions).flatMap((action) =>
              Object.values(action.enforce ?? {}).flatMap((entry) =>
                (Array.isArray(entry) ? entry : [entry]).map(
                  (rule) => rule.constraint,
                ),
              ),
            ),
          ),
        ],
      },
    }));

  const response: ResourcesDiscoveryResponse = {
    gateway: {
      version: GATEWAY_VERSION,
      name: GATEWAY_NAME,
    },
    resources,
  };

  return NextResponse.json(response, {
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "public, max-age=60", // Cache for 1 minute
    },
  });
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_PREFLIGHT_HEADERS,
  });
}
