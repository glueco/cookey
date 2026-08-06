import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ============================================
// NONCE MANAGEMENT (Replay Protection)
// Postgres-backed: unique insert = fresh nonce, conflict = replay.
// Replaces the former Redis SETNX implementation.
// ============================================

// TTL = PoP timestamp window (±90s) × 2. A nonce only needs to survive as
// long as its timestamp would still validate; expired rows are swept by cron.
const NONCE_TTL_SECONDS = 180;

/**
 * Check if a nonce has been used. If not, mark it as used.
 * Returns true if nonce is valid (not seen before), false if replay detected.
 */
export async function checkAndSetNonce(nonce: string): Promise<boolean> {
  try {
    await prisma.popNonce.create({
      data: {
        nonce,
        expiresAt: new Date(Date.now() + NONCE_TTL_SECONDS * 1000),
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Nonce already seen - replay attack
      return false;
    }
    throw error;
  }
}

/**
 * Delete expired nonces. Called from the cron sweep.
 */
export async function cleanupExpiredNonces(): Promise<number> {
  const result = await prisma.popNonce.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
