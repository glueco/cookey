/**
 * Connection flow for the Cookey SDK: submit a grant document to a
 * gateway using a pairing string, then poll the approval status.
 *
 * The gateway accepts ONLY grant documents (docs/GRANT_SPEC.md) — there
 * is no other request format.
 */

import { parsePairingString } from "./pairing";
import { loadSeedFromEnv, publicKeyFromSeed } from "./keys";
import { resolveFetch } from "./fetch";

// ============================================
// TYPES
// ============================================

export interface GrantSubmitOptions {
  /** Pairing string from the gateway admin (pair::<url>::<code>) */
  pairingString: string;
  /** The grant document (docs/GRANT_SPEC.md). When auth is "pop" and
   *  publicKey is omitted, it is derived from GLUECO_PRIVATE_KEY. */
  grant: Record<string, unknown>;
  /** Optional custom fetch */
  fetch?: typeof fetch;
}

export interface ConnectResult {
  /** URL the owner opens to review and approve the grant */
  approvalUrl: string;
  /** Gateway URL (from the pairing string) */
  proxyUrl: string;
  /** The pending grant id — poll /api/connect/status?session={grantId} */
  grantId?: string;
  /** Advisory approval-window hint */
  expiresAt?: Date;
}

export class ConnectError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "ConnectError";
  }
}

// ============================================
// GRANT SUBMISSION
// ============================================

/**
 * Submit a grant document to the gateway.
 *
 * @throws ConnectError when the gateway rejects the code or document
 */
export async function submitGrant(
  options: GrantSubmitOptions,
): Promise<ConnectResult> {
  const fetchFn = resolveFetch(options.fetch);
  const pairingInfo = parsePairingString(options.pairingString);

  const grant = { ...options.grant };
  if (grant.auth === "pop" && !grant.publicKey) {
    const seed = loadSeedFromEnv();
    grant.publicKey = await publicKeyFromSeed(seed);
  }

  let response: Response;
  try {
    response = await fetchFn(`${pairingInfo.proxyUrl}/api/connect/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectCode: pairingInfo.connectCode,
        grant,
      }),
    });
  } catch (e) {
    throw new ConnectError(`Failed to connect to gateway: ${e}`);
  }

  if (!response.ok) {
    let errorMessage: string;
    try {
      const body = await response.json();
      errorMessage =
        body?.error?.message ?? body?.error ?? `Connection failed: ${response.status}`;
    } catch {
      errorMessage = `Connection failed: ${response.status}`;
    }
    throw new ConnectError(errorMessage, response.status);
  }

  const data = await response.json();
  return {
    approvalUrl: data.approvalUrl,
    proxyUrl: pairingInfo.proxyUrl,
    grantId: data.grantId,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
  };
}
