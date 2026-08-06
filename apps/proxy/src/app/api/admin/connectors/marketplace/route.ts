import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/lib/admin-auth";
import { safeFetch, SafeFetchError } from "@/lib/safe-fetch";
import { getMarketplaceUrl } from "@/server/settings";

// ============================================
// GET /api/admin/connectors/marketplace
// Server-side fetch of the marketplace registry index (SSRF-guarded,
// cached 10 min in-process). Never installs anything — the install
// path is the same preview→review→freeze flow as install-by-URL.
// ============================================

const CACHE_TTL_MS = 10 * 60 * 1000;

export interface RegistryEntry {
  id: string;
  name: string;
  description: string;
  resourceType: string;
  version: string;
  path: string;
  iconPath?: string;
  official?: boolean;
}

const globalForMarketplace = globalThis as unknown as {
  marketplaceCache:
    | { url: string; fetchedAt: number; entries: RegistryEntry[] }
    | undefined;
};

export async function GET(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const registryUrl = await getMarketplaceUrl();
  const cache = globalForMarketplace.marketplaceCache;
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";

  if (
    !refresh &&
    cache &&
    cache.url === registryUrl &&
    Date.now() - cache.fetchedAt < CACHE_TTL_MS
  ) {
    return NextResponse.json({
      registryUrl,
      entries: cache.entries,
      cached: true,
    });
  }

  let entries: RegistryEntry[];
  try {
    const result = await safeFetch(registryUrl, { maxBytes: 256 * 1024 });
    if (result.status !== 200) {
      return NextResponse.json(
        { error: `Registry returned HTTP ${result.status}`, registryUrl },
        { status: 502 },
      );
    }
    const parsed = JSON.parse(result.text) as
      | RegistryEntry[]
      | { connectors: RegistryEntry[] };
    entries = Array.isArray(parsed) ? parsed : (parsed.connectors ?? []);
  } catch (error) {
    const message =
      error instanceof SafeFetchError
        ? `Fetch blocked: ${error.message}`
        : "Registry index is not valid JSON";
    return NextResponse.json({ error: message, registryUrl }, { status: 502 });
  }

  globalForMarketplace.marketplaceCache = {
    url: registryUrl,
    fetchedAt: Date.now(),
    entries,
  };

  // Installed state for the UI
  const installed = await prisma.connector.findMany({
    select: { connectorId: true, version: true },
  });

  return NextResponse.json({
    registryUrl,
    entries,
    installed: Object.fromEntries(
      installed.map((c) => [c.connectorId, c.version]),
    ),
  });
}
