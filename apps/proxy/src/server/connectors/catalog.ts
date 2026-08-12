import { prisma } from "@/lib/db";
import { listEnabledConnectors } from "./registry";
import {
  describeConnector,
  type ResourceCapabilities,
} from "./capabilities";

// ============================================
// RESOURCE CATALOGUE
//
// "Every connector this gateway has enabled, annotated with what the
// enforcement engine can actually restrict on it, and whether it has
// credentials to serve with."
//
// Two screens need exactly this list — the approval screen (to offer
// real per-service limits) and the template editor (to build a
// permissions package out of services that exist). It lives here so
// they can't drift.
// ============================================

export async function listResourceCapabilities(): Promise<
  ResourceCapabilities[]
> {
  const [secrets, connectors] = await Promise.all([
    prisma.resourceSecret.findMany({
      where: { status: "ACTIVE" },
      select: { resourceId: true, name: true },
      orderBy: { resourceId: "asc" },
    }),
    listEnabledConnectors(),
  ]);

  // The owner's own name for a configured resource wins over the
  // connector's generic one — that's what they'll recognise.
  const configuredNames = new Map(
    secrets.map((secret) => [secret.resourceId, secret.name]),
  );

  return connectors.map((connector) =>
    describeConnector(connector, {
      configured: configuredNames.has(connector.id),
      name: configuredNames.get(connector.id),
    }),
  );
}
