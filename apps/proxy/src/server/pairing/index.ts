import { prisma } from "@/lib/db";
import { sha256 } from "@noble/hashes/sha256";
import { base64UrlEncode } from "@/lib/crypto";
import { nanoid } from "nanoid";

// ============================================
// PAIRING FLOW
// Owner-generated single-use connect codes (10-min TTL, hash-stored).
// The install-session flow was superseded by PENDING grants; approval
// state now lives on the Grant row.
// ============================================

const CODE_LENGTH = 32; // High entropy
const CODE_TTL_MINUTES = 10;

/**
 * Generate a new pairing string.
 * Format: pair::<proxy_url>::<connect_code>
 */
export async function generatePairingString(): Promise<{
  pairingString: string;
  codeId: string;
  expiresAt: Date;
}> {
  const gatewayUrl = process.env.GATEWAY_URL;
  if (!gatewayUrl) {
    throw new Error("GATEWAY_URL not configured");
  }

  // Generate high-entropy code
  const code = nanoid(CODE_LENGTH);

  // Hash the code for storage
  const codeHash = base64UrlEncode(sha256(new TextEncoder().encode(code)));

  // Calculate expiry
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  // Store hashed code
  const connectCode = await prisma.connectCode.create({
    data: {
      codeHash,
      expiresAt,
    },
  });

  // Build pairing string
  const pairingString = `pair::${gatewayUrl}::${code}`;

  return {
    pairingString,
    codeId: connectCode.id,
    expiresAt,
  };
}

/**
 * Verify a connect code.
 * Returns true if valid; marks the code as used (single-use).
 */
export async function verifyConnectCode(code: string): Promise<boolean> {
  const codeHash = base64UrlEncode(sha256(new TextEncoder().encode(code)));

  const connectCode = await prisma.connectCode.findUnique({
    where: { codeHash },
  });

  if (!connectCode) {
    return false;
  }

  // Check if expired
  if (connectCode.expiresAt < new Date()) {
    return false;
  }

  // Check if already used
  if (connectCode.usedAt) {
    return false;
  }

  // Mark as used
  await prisma.connectCode.update({
    where: { id: connectCode.id },
    data: { usedAt: new Date() },
  });

  return true;
}

// ============================================
// RESOURCE AVAILABILITY
// ============================================

/**
 * Check which resources are configured (have secrets set up).
 * Returns a map of resourceId -> availability info.
 */
export async function getResourceAvailability(
  resourceIds: string[],
): Promise<Record<string, { available: boolean; name?: string }>> {
  const result: Record<string, { available: boolean; name?: string }> = {};

  // Initialize all as unavailable
  resourceIds.forEach((id) => {
    result[id] = { available: false };
  });

  if (resourceIds.length === 0) {
    return result;
  }

  // Query configured resources
  const configuredResources = await prisma.resourceSecret.findMany({
    where: {
      resourceId: { in: resourceIds },
      status: "ACTIVE",
    },
    select: {
      resourceId: true,
      name: true,
    },
  });

  // Mark available resources
  configuredResources.forEach((resource) => {
    result[resource.resourceId] = {
      available: true,
      name: resource.name,
    };
  });

  return result;
}
