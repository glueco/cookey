/**
 * Connection flow for the Glueco Gateway SDK.
 *
 * Handles:
 * 1. Initiating the connect/prepare flow
 * 2. Handling callbacks after user approval
 *
 * The SDK uses GLUECO_PRIVATE_KEY from environment. It derives the public key
 * and sends it during connection.
 */

import { parsePairingString, PairingInfo } from "./pairing";
import { loadSeedFromEnv, publicKeyFromSeed, KeyError } from "./keys";
import { resolveFetch } from "./fetch";

// ============================================
// CONNECT TYPES
// ============================================

export interface ConnectOptions {
  /** Pairing string from gateway admin */
  pairingString: string;

  /** App metadata */
  app: {
    name: string;
    description?: string;
    homepage?: string;
  };

  /** Requested permissions */
  requestedPermissions: Array<{
    resourceId: string;
    actions: string[];
    requestedDuration?: {
      type: "preset" | "custom";
      value?: string;
      seconds?: number;
    };
  }>;

  /** Redirect URI for callback */
  redirectUri: string;

  /** Optional custom fetch */
  fetch?: typeof fetch;
}

export interface ConnectResult {
  /** URL to redirect user to for approval */
  approvalUrl: string;

  /** Proxy URL (from pairing string) */
  proxyUrl: string;

  /** When the session expires */
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
// CONNECT FLOW
// ============================================

/**
 * Initiate the connection flow with the gateway.
 *
 * This function:
 * 1. Parses the pairing string
 * 2. Loads private key seed from GLUECO_PRIVATE_KEY env
 * 3. Derives public key from seed
 * 4. Calls the /api/connect/prepare endpoint with publicKey
 * 5. Returns the approval URL (NO secrets returned)
 *
 * @throws KeyError if GLUECO_PRIVATE_KEY env var is missing or invalid
 * @throws ConnectError if gateway request fails
 */
export async function connect(options: ConnectOptions): Promise<ConnectResult> {
  const { pairingString, app, requestedPermissions, redirectUri } = options;
  const fetchFn = resolveFetch(options.fetch);

  // Parse pairing string
  const pairingInfo = parsePairingString(pairingString);

  // Load seed from env and derive public key
  const seed = loadSeedFromEnv();
  const publicKey = publicKeyFromSeed(seed);

  // Build permissions payload
  const permissionsPayload = requestedPermissions.map((perm) => {
    const permDict: Record<string, unknown> = {
      resourceId: perm.resourceId,
      actions: perm.actions,
    };
    if (perm.requestedDuration) {
      permDict.requestedDuration = {
        type: perm.requestedDuration.type,
        [perm.requestedDuration.type]: perm.requestedDuration.value ?? perm.requestedDuration.seconds,
      };
    }
    return permDict;
  });

  // Build request payload - includes publicKey for proxy to store
  const requestPayload = {
    connectCode: pairingInfo.connectCode,
    app: {
      name: app.name,
      description: app.description,
      homepage: app.homepage,
    },
    publicKey, // Proxy stores this with app_id
    requestedPermissions: permissionsPayload,
    redirectUri,
  };

  // Call prepare endpoint
  let response: Response;
  try {
    response = await fetchFn(`${pairingInfo.proxyUrl}/api/connect/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
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

  // Return ONLY non-secret data
  return {
    approvalUrl: data.approvalUrl,
    proxyUrl: pairingInfo.proxyUrl,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
  };
}

// ============================================
// CALLBACK HANDLING
// ============================================

/**
 * Handle the callback after user approval/denial.
 *
 * Call this when the user is redirected back to your app.
 * The app should persist app_id and proxy_url.
 */
export function handleCallback(params: URLSearchParams): {
  approved: boolean;
  appId?: string;
  expiresAt?: Date;
} {
  const status = params.get("status");
  const appId = params.get("app_id");
  const expiresAt = params.get("expires_at");

  if (status === "approved" && appId) {
    return {
      approved: true,
      appId,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    };
  }

  return { approved: false };
}
