import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ErrorCode, getErrorStatus } from "@/shared";
import { authenticateRequest, getAuthErrorStatus } from "./pop";
import { authenticateBearer, extractBearerToken } from "./bearer";
import { getClientIp } from "@/lib/client-ip";
import type { Grant, GrantAuth, GrantStatus, GrantToken } from "@prisma/client";

// ============================================
// AUTH RESOLUTION
// Resolution order (7.2 stage 1):
//   Bearer ck_ prefix → GrantToken path
//   x-sig header present → PoP path
//   both → 400, neither → 401
// ============================================

export interface ResolvedAuth {
  success: boolean;
  grant?: Grant;
  token?: GrantToken;
  authType?: GrantAuth;
  clientIp: string | null;
  error?: {
    status: number;
    code: ErrorCode;
    message: string;
  };
}

export async function resolveAuth(
  request: NextRequest,
  body: string | Uint8Array,
): Promise<ResolvedAuth> {
  const clientIp = getClientIp(request);
  const bearerToken = extractBearerToken(request);
  const hasPop = request.headers.get("x-sig") !== null;

  if (bearerToken && hasPop) {
    return {
      success: false,
      clientIp,
      error: {
        status: getErrorStatus(ErrorCode.ERR_AMBIGUOUS_AUTH),
        code: ErrorCode.ERR_AMBIGUOUS_AUTH,
        message:
          "Request carries both a bearer token and PoP headers; use exactly one auth scheme",
      },
    };
  }

  if (bearerToken) {
    const result = await authenticateBearer(bearerToken, clientIp);
    if (!result.success) {
      return {
        success: false,
        clientIp,
        error: {
          status: getErrorStatus(result.errorCode!),
          code: result.errorCode!,
          message: result.error!,
        },
      };
    }
    return {
      success: true,
      grant: result.grant!,
      token: result.token,
      authType: "BEARER",
      clientIp,
    };
  }

  if (hasPop) {
    const result = await authenticateRequest(request, body);
    if (!result.success) {
      return {
        success: false,
        clientIp,
        error: {
          status: getAuthErrorStatus(result.errorCode!),
          code: result.errorCode!,
          message: result.error!,
        },
      };
    }

    const grant = await prisma.grant.findUnique({
      where: { appId: result.appId! },
    });

    if (!grant) {
      return {
        success: false,
        clientIp,
        error: {
          status: 403,
          code: ErrorCode.ERR_PERMISSION_DENIED,
          message: "No grant exists for this app",
        },
      };
    }

    // Awaited so lastUsedAt reliably advances (feeds the inactivity sweep)
    await recordGrantUse(grant, clientIp).catch(() => {
      // Usage tracking must never fail the request
    });

    return { success: true, grant, authType: "POP", clientIp };
  }

  return {
    success: false,
    clientIp,
    error: {
      status: 401,
      code: ErrorCode.ERR_MISSING_AUTH,
      message:
        "Missing authentication: provide Authorization: Bearer ck_… or PoP headers (x-app-id, x-ts, x-nonce, x-sig)",
    },
  };
}

const LAST_USED_THROTTLE_MS = 60 * 1000;

async function recordGrantUse(
  grant: Grant,
  clientIp: string | null,
): Promise<void> {
  const now = new Date();
  const stale =
    !grant.lastUsedAt ||
    now.getTime() - grant.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS;
  const ipChanged = clientIp !== null && clientIp !== grant.lastUsedIp;
  if (stale || ipChanged) {
    await prisma.grant.update({
      where: { id: grant.id },
      data: { lastUsedAt: now, ...(clientIp && { lastUsedIp: clientIp }) },
    });
  }
}

// ============================================
// GRANT STATE → ERROR MAPPING
// ============================================

const GRANT_STATE_ERRORS: Partial<
  Record<GrantStatus, { code: ErrorCode; message: string }>
> = {
  PENDING: {
    code: ErrorCode.ERR_GRANT_PENDING,
    message: "Grant is pending owner approval",
  },
  SUSPENDED_INACTIVITY: {
    code: ErrorCode.ERR_GRANT_SUSPENDED,
    message: "Grant was suspended for inactivity; the owner can reactivate it",
  },
  SUSPENDED_ANOMALY: {
    code: ErrorCode.ERR_GRANT_SUSPENDED,
    message: "Grant was suspended after anomalous activity",
  },
  SUSPENDED_MANUAL: {
    code: ErrorCode.ERR_GRANT_SUSPENDED,
    message: "Grant was suspended by the owner",
  },
  EXPIRED: {
    code: ErrorCode.ERR_GRANT_EXPIRED,
    message: "Grant has expired",
  },
  REVOKED: {
    code: ErrorCode.ERR_GRANT_REVOKED,
    message: "Grant was revoked by the owner",
  },
  DENIED: {
    code: ErrorCode.ERR_GRANT_DENIED,
    message: "Grant was denied by the owner",
  },
};

/**
 * Returns null when the grant is ACTIVE, otherwise the state-specific error.
 * Expiry is checked inline (not just via the sweep cron, which only runs
 * daily on Hobby deployments): a grant past its hard expiry or renewal
 * period is dead immediately, regardless of its stored status.
 */
export function checkGrantState(
  grant: Grant,
): { status: number; code: ErrorCode; message: string } | null {
  if (grant.status === "ACTIVE") {
    const now = new Date();
    const pastExpiry = grant.expiresAt !== null && grant.expiresAt < now;
    const pastPeriod =
      grant.currentPeriodEnd !== null && grant.currentPeriodEnd < now;
    if (pastExpiry || pastPeriod) {
      return {
        status: getErrorStatus(ErrorCode.ERR_GRANT_EXPIRED),
        code: ErrorCode.ERR_GRANT_EXPIRED,
        message: pastExpiry
          ? "Grant has expired"
          : "Grant's renewal period has lapsed — the owner can renew it",
      };
    }
    return null;
  }
  const mapped = GRANT_STATE_ERRORS[grant.status] ?? {
    code: ErrorCode.ERR_PERMISSION_DENIED,
    message: `Grant is ${grant.status}`,
  };
  return { status: getErrorStatus(mapped.code), ...mapped };
}

/**
 * Origin gate (7.2 stage 3): block browser-originated requests unless the
 * grant explicitly allows them. Browser requests carry an Origin header or
 * Sec-Fetch-Site: cross-site; server-side HTTP clients send neither.
 */
export function checkOriginGate(
  request: NextRequest,
  grant: Grant,
): { status: number; code: ErrorCode; message: string } | null {
  if (grant.allowBrowser) return null;
  const hasOrigin = request.headers.get("origin") !== null;
  const crossSite = request.headers.get("sec-fetch-site") === "cross-site";
  if (hasOrigin || crossSite) {
    return {
      status: getErrorStatus(ErrorCode.ERR_BROWSER_BLOCKED),
      code: ErrorCode.ERR_BROWSER_BLOCKED,
      message:
        "Browser-originated requests are blocked for this grant (allowBrowser is off)",
    };
  }
  return null;
}
