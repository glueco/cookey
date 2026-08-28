import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { Connector, ConnectorSource } from "@prisma/client";
import {
  validateConnectorDocument,
  type ConnectorDocument,
  type ConnectorValidationError,
} from "./schema";
import { getAdapter, type Adapter } from "@/server/adapters";
import { logger } from "@/lib/logger";

import groqSeed from "./builtin/llm-groq.json";
import openaiSeed from "./builtin/llm-openai.json";
import geminiSeed from "./builtin/llm-gemini.json";
import anthropicSeed from "./builtin/llm-anthropic.json";
import resendSeed from "./builtin/mail-resend.json";

// ============================================
// CONNECTOR RUNTIME REGISTRY
// Loads enabled connectors from the DB with a 60s in-memory cache and
// explicit invalidation on admin mutations. The pipeline resolves
// resourceId → { document, adapter } from here.
// ============================================

const CACHE_TTL_MS = 60 * 1000;

const BUILTIN_SEEDS = [
  groqSeed,
  openaiSeed,
  geminiSeed,
  anthropicSeed,
  resendSeed,
] as unknown[];

interface CacheState {
  loadedAt: number;
  byId: Map<string, { document: ConnectorDocument; adapter: Adapter }>;
}

const globalForConnectors = globalThis as unknown as {
  connectorCache: CacheState | undefined;
  connectorSeedPromise: Promise<void> | undefined;
};

export interface ResolvedConnector {
  document: ConnectorDocument;
  adapter: Adapter;
}

/**
 * Full install-time validation: document schema + adapter existence +
 * the adapter's own config schema.
 */
export function validateConnectorFull(
  raw: unknown,
):
  | { valid: true; document: ConnectorDocument }
  | ConnectorValidationError {
  const result = validateConnectorDocument(raw);
  if (!result.valid) return result;

  const adapter = getAdapter(result.document.adapter);
  if (!adapter) {
    return {
      valid: false,
      errors: [
        {
          path: "adapter",
          message: `Unknown adapter "${result.document.adapter}" — this gateway has no such wire-protocol implementation`,
        },
      ],
    };
  }

  const configResult = adapter.configSchema.safeParse(result.document.config);
  if (!configResult.success) {
    return {
      valid: false,
      errors: configResult.error.errors.map((e) => ({
        path: `config.${e.path.join(".")}`,
        message: e.message,
      })),
    };
  }
  // Persist the parsed config so adapter defaults (e.g. auth.type) are frozen
  result.document.config = configResult.data as Record<string, unknown>;

  return { valid: true, document: result.document };
}

/**
 * Compare two semver strings (numeric fields only). True when a > b.
 */
export function semverGt(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Seed the built-in connectors. Missing → created. Present with source
 * BUILTIN and a LOWER version than the shipped seed → upgraded in place
 * (shipped built-in updates must land on existing deployments). Any row
 * whose source is no longer BUILTIN (admin replaced it via the builder
 * or an install) is never touched. Runs once per process, lazily.
 */
export async function ensureBuiltinsSeeded(): Promise<void> {
  if (!globalForConnectors.connectorSeedPromise) {
    globalForConnectors.connectorSeedPromise = seedBuiltins().catch((error) => {
      globalForConnectors.connectorSeedPromise = undefined;
      throw error;
    });
  }
  return globalForConnectors.connectorSeedPromise;
}

async function seedBuiltins(): Promise<void> {
  for (const seed of BUILTIN_SEEDS) {
    const result = validateConnectorFull(seed);
    if (!result.valid) {
      logger.error("Built-in connector seed is invalid", {
        errors: result.errors,
      });
      continue;
    }
    const document = result.document;

    const existing = await prisma.connector.findUnique({
      where: { connectorId: document.id },
      select: { id: true, version: true, source: true },
    });

    if (existing) {
      if (
        existing.source === "BUILTIN" &&
        semverGt(document.version, existing.version)
      ) {
        await prisma.connector.update({
          where: { id: existing.id },
          data: {
            resourceType: document.resourceType,
            version: document.version,
            document: document as unknown as Prisma.InputJsonValue,
          },
        });
        invalidateConnectorCache();
        logger.info("Built-in connector upgraded", {
          connectorId: document.id,
          from: existing.version,
          to: document.version,
        });
      }
      continue;
    }

    await prisma.connector.create({
      data: {
        connectorId: document.id,
        resourceType: document.resourceType,
        version: document.version,
        source: "BUILTIN",
        document: document as unknown as Prisma.InputJsonValue,
      },
    });
    logger.info("Seeded built-in connector", { connectorId: document.id });
  }
}

/**
 * Force-restore the built-in documents ("Restore built-ins" button).
 * Overwrites BUILTIN rows with the shipped documents.
 */
export async function restoreBuiltins(): Promise<number> {
  let restored = 0;
  for (const seed of BUILTIN_SEEDS) {
    const result = validateConnectorFull(seed);
    if (!result.valid) continue;
    const document = result.document;
    await prisma.connector.upsert({
      where: { connectorId: document.id },
      create: {
        connectorId: document.id,
        resourceType: document.resourceType,
        version: document.version,
        source: "BUILTIN",
        document: document as unknown as Prisma.InputJsonValue,
      },
      update: {
        version: document.version,
        source: "BUILTIN",
        document: document as unknown as Prisma.InputJsonValue,
      },
    });
    restored++;
  }
  invalidateConnectorCache();
  return restored;
}

async function loadCache(): Promise<CacheState> {
  await ensureBuiltinsSeeded();

  const rows = await prisma.connector.findMany({ where: { enabled: true } });
  const byId = new Map<string, ResolvedConnector>();

  for (const row of rows) {
    const frozen = row.document as unknown as ConnectorDocument;
    // Owner pricing corrections apply HERE, at the single point every
    // consumer resolves documents through — enforcement cost, the
    // approval screen's projection and capability listings all see the
    // effective rates without knowing overrides exist. The frozen
    // document itself is never mutated.
    const overrides = row.pricingOverrides as
      | ConnectorDocument["pricing"]
      | null;
    const document =
      overrides && Object.keys(overrides).length > 0
        ? { ...frozen, pricing: { ...frozen.pricing, ...overrides } }
        : frozen;
    const adapter = getAdapter(document.adapter);
    if (!adapter) {
      logger.error("Connector references unknown adapter; skipping", {
        connectorId: row.connectorId,
        adapter: document.adapter,
      });
      continue;
    }
    byId.set(row.connectorId, { document, adapter });
  }

  return { loadedAt: Date.now(), byId };
}

async function getCache(): Promise<CacheState> {
  const cache = globalForConnectors.connectorCache;
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }
  const fresh = await loadCache();
  globalForConnectors.connectorCache = fresh;
  return fresh;
}

/** Explicit invalidation — call after any admin connector mutation. */
export function invalidateConnectorCache(): void {
  globalForConnectors.connectorCache = undefined;
}

/** Resolve an enabled connector for the data plane. */
export async function resolveConnector(
  resourceId: string,
): Promise<ResolvedConnector | null> {
  const cache = await getCache();
  return cache.byId.get(resourceId) ?? null;
}

/** All enabled connector documents (discovery, wildcard binding, UI). */
export async function listEnabledConnectors(): Promise<ConnectorDocument[]> {
  const cache = await getCache();
  return [...cache.byId.values()].map((entry) => entry.document);
}

// ============================================
// INSTALL / UPDATE (admin mutations)
// ============================================

export class ConnectorInstallError extends Error {
  constructor(
    message: string,
    public readonly errors: Array<{ path: string; message: string }> = [],
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "ConnectorInstallError";
  }
}

/**
 * Install (or explicitly replace) a connector from a validated document.
 * The exact JSON is frozen into the row; the gateway NEVER re-fetches a
 * connector at request time.
 */
export async function installConnector(
  raw: unknown,
  source: ConnectorSource,
  options: { sourceUrl?: string; replaceExisting?: boolean } = {},
): Promise<Connector> {
  const result = validateConnectorFull(raw);
  if (!result.valid) {
    throw new ConnectorInstallError(
      "Connector document failed validation",
      result.errors,
    );
  }
  const document = result.document;

  const existing = await prisma.connector.findUnique({
    where: { connectorId: document.id },
  });
  if (existing && !options.replaceExisting) {
    throw new ConnectorInstallError(
      `Connector "${document.id}" is already installed (v${existing.version}). Use the update flow to replace it.`,
      [],
      409,
    );
  }

  const row = await prisma.connector.upsert({
    where: { connectorId: document.id },
    create: {
      connectorId: document.id,
      resourceType: document.resourceType,
      version: document.version,
      source,
      sourceUrl: options.sourceUrl,
      document: document as unknown as Prisma.InputJsonValue,
    },
    update: {
      resourceType: document.resourceType,
      version: document.version,
      source,
      sourceUrl: options.sourceUrl,
      document: document as unknown as Prisma.InputJsonValue,
      updateAvailable: Prisma.JsonNull,
    },
  });

  invalidateConnectorCache();
  return row;
}
