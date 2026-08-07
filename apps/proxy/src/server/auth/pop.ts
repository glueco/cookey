import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { checkAndSetNonce } from "@/server/limits/nonce";
import {
  PoPHeaders,
  hashBody,
  validateTimestamp,
  verifySignatureWithCanonical,
} from "@/lib/crypto";
import {
  ErrorCode,
  POP_VERSION,
  buildCanonicalRequestV1,
  getPathWithQuery,
} from "@/shared";

// ============================================
// PoP AUTHENTICATION
// ============================================

export interface AuthResult {
  success: boolean;
  appId?: string;
  error?: string;
  errorCode?: ErrorCode;
}

/**
 * Extract PoP headers from request.
 */
export function extractPoPHeaders(request: NextRequest): PoPHeaders | null {
  const popVersion = request.headers.get("x-pop-v");
  const appId = request.headers.get("x-app-id");
  const timestamp = request.headers.get("x-ts");
  const nonce = request.headers.get("x-nonce");
  const signature = request.headers.get("x-sig");

  if (!appId || !timestamp || !nonce || !signature) {
    return null;
  }

  return { popVersion, appId, timestamp, nonce, signature };
}

/**
 * Authenticate a request using PoP.
 */
export async function authenticateRequest(
  request: NextRequest,
  body: string | Uint8Array,
): Promise<AuthResult> {
  try {
    // 1. Extract headers
    const headers = extractPoPHeaders(request);
    if (!headers) {
      return {
        success: false,
        error: "Missing required PoP headers (x-app-id, x-ts, x-nonce, x-sig)",
        errorCode: ErrorCode.ERR_MISSING_AUTH,
      };
    }

    // 2. Validate PoP version — v1 is required, nothing else is spoken
    if (headers.popVersion !== POP_VERSION) {
      return {
        success: false,
        error: `Unsupported PoP version: ${headers.popVersion ?? "(missing x-pop-v)"}. Expected: ${POP_VERSION}`,
        errorCode: ErrorCode.ERR_UNSUPPORTED_POP_VERSION,
      };
    }

    // 3. Validate timestamp (±90 seconds)
    if (!validateTimestamp(headers.timestamp)) {
      return {
        success: false,
        error: "Request timestamp outside acceptable window (±90 seconds)",
        errorCode: ErrorCode.ERR_EXPIRED_TIMESTAMP,
      };
    }

    // 4. Lookup app and verify status
    // (Nonce consumption happens AFTER signature verification — an
    // unauthenticated caller must not be able to burn nonces or grow
    // the PopNonce table, and a failed signature must not consume the
    // nonce the client will legitimately retry with.)
    const app = await prisma.app.findUnique({
      where: { id: headers.appId },
      include: {
        credentials: {
          where: { status: "ACTIVE" },
        },
      },
    });

    if (!app) {
      return {
        success: false,
        error: "App not found",
        errorCode: ErrorCode.ERR_APP_NOT_FOUND,
      };
    }

    if (app.status !== "ACTIVE") {
      return {
        success: false,
        error: `App is ${app.status.toLowerCase()}`,
        errorCode: ErrorCode.ERR_APP_DISABLED,
      };
    }

    if (app.credentials.length === 0) {
      return {
        success: false,
        error: "No active credentials for app",
        errorCode: ErrorCode.ERR_APP_NOT_FOUND,
      };
    }

    // 5. Build canonical request string (v1: path includes query)
    const url = new URL(request.url);
    const canonicalString = buildCanonicalRequestV1({
      method: request.method,
      pathWithQuery: getPathWithQuery(url),
      appId: headers.appId,
      ts: headers.timestamp,
      nonce: headers.nonce,
      bodyHash: hashBody(body),
    });

    // 6. Verify signature against any active credential
    for (const credential of app.credentials) {
      const valid = await verifySignatureWithCanonical(
        credential.publicKey,
        headers.signature,
        canonicalString,
      );

      if (valid) {
        // 7. Consume the nonce only for a correctly-signed request
        const nonceValid = await checkAndSetNonce(headers.nonce);
        if (!nonceValid) {
          return {
            success: false,
            error: "Replay detected: nonce already used",
            errorCode: ErrorCode.ERR_INVALID_NONCE,
          };
        }
        return {
          success: true,
          appId: headers.appId,
        };
      }
    }

    return {
      success: false,
      error: "Invalid signature",
      errorCode: ErrorCode.ERR_INVALID_SIGNATURE,
    };
  } catch (error) {
    console.error("Authentication error:", error);
    return {
      success: false,
      error: "Internal authentication error",
      errorCode: ErrorCode.ERR_INTERNAL,
    };
  }
}

/**
 * Get HTTP status code for auth error.
 */
export function getAuthErrorStatus(errorCode: ErrorCode): number {
  switch (errorCode) {
    case ErrorCode.ERR_MISSING_AUTH:
    case ErrorCode.ERR_EXPIRED_TIMESTAMP:
    case ErrorCode.ERR_INVALID_NONCE:
    case ErrorCode.ERR_INVALID_SIGNATURE:
    case ErrorCode.ERR_APP_NOT_FOUND:
      return 401;
    case ErrorCode.ERR_APP_DISABLED:
      return 403;
    case ErrorCode.ERR_UNSUPPORTED_POP_VERSION:
      return 400;
    case ErrorCode.ERR_INTERNAL:
    default:
      return 500;
  }
}
