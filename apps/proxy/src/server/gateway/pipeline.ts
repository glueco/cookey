import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/server/limits/rate-limit";
import {
  checkAndIncrementRequestUsage,
  checkTokenBudget,
  recordTokenUsage,
} from "@/server/limits/budget";
import { decryptSecret } from "@/lib/vault";
import {
  resolveAuth,
  checkGrantState,
  checkOriginGate,
} from "@/server/auth/resolve";
import { ipMatchesList } from "@/lib/ip-match";
import { resolveConnector } from "@/server/connectors/registry";
import type { ConnectorDocument } from "@/server/connectors/schema";
import { applyEnforcement, extractUsage, mapUpstreamError } from "./enforce";
import { UpstreamError, type AdapterResult } from "@/server/adapters";
import { checkPermissionValidity } from "./access-policy";
import { RequestDecision } from "@prisma/client";
import type { Grant, GrantAuth, ResourcePermission } from "@prisma/client";
import { ErrorCode, getErrorStatus } from "@glueco/shared";
import { logger, generateRequestId, createRequestLogger } from "@/lib/logger";

// ============================================
// GATEWAY PIPELINE
// Orchestrates auth → grant state → hardening gates → permission →
// limits → enforcement → execute → audit (7.2 stage order).
//
// Key invariants (unchanged from the schema-first pipeline):
// - Request body is validated and shaped ONCE
// - If any stage denies, the upstream is never called
// - Enforcement cannot be bypassed by malformed payloads
// ============================================

export interface GatewayRequest {
  resourceId: string;
  action: string;
  input: unknown;
  stream: boolean;
  /** Raw body bytes for forwarding - avoids re-reading consumed stream */
  rawBody?: Uint8Array;
  /** http-passthrough: remaining sub-path (incl. query) to forward */
  subPath?: string;
}

export interface GatewayResult {
  success: boolean;
  decision: RequestDecision;
  decisionReason?: string;

  // On success
  result?: AdapterResult & { usage?: ReturnType<typeof extractUsage> };

  // On error
  error?: GatewayError;

  // Metadata for audit
  metadata?: {
    appId?: string;
    grantId?: string;
    model?: string;
    latencyMs?: number;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    costEstimate?: number;
  };
}

export interface GatewayError {
  status: number;
  code: string;
  message: string;
}

const DEFAULT_RATE_LIMIT_REQUESTS = 60;
const DEFAULT_RATE_LIMIT_WINDOW_SECS = 60;

export async function processGatewayRequest(
  request: NextRequest,
  body: string,
  gatewayRequest: GatewayRequest,
): Promise<GatewayResult> {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId);
  let grant: Grant | undefined;
  let authType: GrantAuth | undefined;

  log.debug("Processing gateway request", {
    resourceId: gatewayRequest.resourceId,
    action: gatewayRequest.action,
    stream: gatewayRequest.stream,
  });

  try {
    // ============================================
    // STAGE 1: Auth Resolve (bearer or PoP)
    // ============================================
    const auth = await resolveAuth(request, body);

    if (!auth.success) {
      log.warn("Authentication failed", {
        errorCode: auth.error!.code,
        reason: auth.error!.message,
      });
      return {
        success: false,
        decision: RequestDecision.DENIED_AUTH,
        decisionReason: auth.error!.message,
        error: auth.error!,
      };
    }

    grant = auth.grant!;
    authType = auth.authType!;
    log.debug("Authentication successful", {
      appId: grant.appId,
      grantId: grant.id,
      authType,
    });

    const baseMetadata = { appId: grant.appId, grantId: grant.id };

    // ============================================
    // STAGE 2: Grant State
    // ============================================
    const stateError = checkGrantState(grant);
    if (stateError) {
      return {
        success: false,
        decision: RequestDecision.DENIED_AUTH,
        decisionReason: stateError.message,
        error: stateError,
        metadata: baseMetadata,
      };
    }

    // ============================================
    // STAGE 3: Origin Gate (browser blocking)
    // ============================================
    const originError = checkOriginGate(request, grant);
    if (originError) {
      return {
        success: false,
        decision: RequestDecision.DENIED_PERMISSION,
        decisionReason: originError.message,
        error: originError,
        metadata: baseMetadata,
      };
    }

    // ============================================
    // STAGE 4: Egress IP Check
    // ============================================
    if (grant.egressIps) {
      // Fail closed: an allowlist with no resolvable client IP denies
      if (!auth.clientIp || !ipMatchesList(auth.clientIp, grant.egressIps)) {
        return {
          success: false,
          decision: RequestDecision.DENIED_PERMISSION,
          decisionReason: `Client IP ${auth.clientIp ?? "(unknown)"} not in grant allowlist`,
          error: {
            status: getErrorStatus(ErrorCode.ERR_IP_BLOCKED),
            code: ErrorCode.ERR_IP_BLOCKED,
            message: "Requests from this IP address are not allowed",
          },
          metadata: baseMetadata,
        };
      }
    }

    // ============================================
    // STAGE 5: Permission Lookup (grantId, appId fallback for legacy rows)
    // ============================================
    const permission = await prisma.resourcePermission.findFirst({
      where: {
        resourceId: gatewayRequest.resourceId,
        action: gatewayRequest.action,
        OR: [{ grantId: grant.id }, { appId: grant.appId, grantId: null }],
      },
    });

    if (!permission || permission.status !== "ACTIVE") {
      return {
        success: false,
        decision: RequestDecision.DENIED_PERMISSION,
        decisionReason: `No permission for ${gatewayRequest.resourceId}:${gatewayRequest.action}`,
        error: {
          status: 403,
          code: ErrorCode.ERR_PERMISSION_DENIED,
          message: `App does not have permission for ${gatewayRequest.resourceId}:${gatewayRequest.action}`,
        },
        metadata: baseMetadata,
      };
    }

    // Time-based validity (validFrom / expiresAt / timeWindow)
    const validity = checkPermissionValidity(permission);
    if (!validity.allowed) {
      log.info("Permission time-check failed", {
        appId: grant.appId,
        resourceId: gatewayRequest.resourceId,
        action: gatewayRequest.action,
        code: validity.code,
      });
      return {
        success: false,
        decision: RequestDecision.DENIED_PERMISSION,
        decisionReason: validity.reason,
        error: {
          status: 403,
          code:
            validity.code === "EXPIRED"
              ? ErrorCode.ERR_PERMISSION_EXPIRED
              : ErrorCode.ERR_PERMISSION_DENIED,
          message: validity.reason!,
        },
        metadata: baseMetadata,
      };
    }

    // ============================================
    // STAGE 6: Rate Limit (fixed window, permission-level values)
    // ============================================
    const rateLimitResult = await checkRateLimit(
      `rl:${grant.id}:${gatewayRequest.resourceId}:${gatewayRequest.action}`,
      permission.rateLimitRequests ?? DEFAULT_RATE_LIMIT_REQUESTS,
      permission.rateLimitWindowSecs ?? DEFAULT_RATE_LIMIT_WINDOW_SECS,
    );

    if (!rateLimitResult.allowed) {
      return {
        success: false,
        decision: RequestDecision.DENIED_RATE_LIMIT,
        decisionReason: `Rate limit exceeded. Retry after ${new Date(rateLimitResult.resetAt * 1000).toISOString()}`,
        error: {
          status: 429,
          code: ErrorCode.ERR_RATE_LIMIT_EXCEEDED,
          message: `Rate limit exceeded. Remaining: ${rateLimitResult.remaining}`,
        },
        metadata: baseMetadata,
      };
    }

    // ============================================
    // STAGE 7: Budget (request quotas at admission, token budgets check-only)
    // ============================================
    const budgetResult = await checkAndIncrementRequestUsage(permission.id, {
      dailyQuota: permission.dailyQuota,
      monthlyQuota: permission.monthlyQuota,
    });

    if (!budgetResult.allowed) {
      return {
        success: false,
        decision: RequestDecision.DENIED_BUDGET,
        decisionReason: `${budgetResult.period.toLowerCase()} request quota exceeded (${budgetResult.used}/${budgetResult.limit})`,
        error: {
          status: 429,
          code: ErrorCode.ERR_BUDGET_EXCEEDED,
          message: `Request quota exceeded. Used: ${budgetResult.used}/${budgetResult.limit}`,
        },
        metadata: baseMetadata,
      };
    }

    const tokenBudgetResult = await checkTokenBudget(permission.id, {
      dailyTokenBudget: permission.dailyTokenBudget,
      monthlyTokenBudget: permission.monthlyTokenBudget,
    });

    if (!tokenBudgetResult.allowed) {
      return {
        success: false,
        decision: RequestDecision.DENIED_BUDGET,
        decisionReason: `${tokenBudgetResult.period.toLowerCase()} token budget exceeded (${tokenBudgetResult.used}/${tokenBudgetResult.limit})`,
        error: {
          status: 429,
          code: ErrorCode.ERR_BUDGET_EXCEEDED,
          message: `Token budget exceeded. Used: ${tokenBudgetResult.used}/${tokenBudgetResult.limit}`,
        },
        metadata: baseMetadata,
      };
    }

    // ============================================
    // STAGE 8: Connector Resolution + Enforcement (generic engine)
    // ============================================
    const resolved = await resolveConnector(gatewayRequest.resourceId);

    if (!resolved) {
      return {
        success: false,
        decision: RequestDecision.ERROR,
        decisionReason: `Unknown resource: ${gatewayRequest.resourceId}`,
        error: {
          status: getErrorStatus(ErrorCode.ERR_UNKNOWN_RESOURCE),
          code: ErrorCode.ERR_UNKNOWN_RESOURCE,
          message: `Resource '${gatewayRequest.resourceId}' is not supported`,
        },
        metadata: baseMetadata,
      };
    }

    const { document: connector, adapter } = resolved;
    const actionSpec = connector.actions[gatewayRequest.action];

    if (!actionSpec) {
      return {
        success: false,
        decision: RequestDecision.ERROR,
        decisionReason: `Unsupported action: ${gatewayRequest.action}`,
        error: {
          status: getErrorStatus(ErrorCode.ERR_UNSUPPORTED_ACTION),
          code: ErrorCode.ERR_UNSUPPORTED_ACTION,
          message: `Action '${gatewayRequest.action}' not supported by ${gatewayRequest.resourceId}`,
        },
        metadata: baseMetadata,
      };
    }

    if (gatewayRequest.stream && !actionSpec.streaming) {
      return {
        success: false,
        decision: RequestDecision.DENIED_CONSTRAINT,
        decisionReason: "Streaming not supported for this action",
        error: {
          status: 400,
          code: ErrorCode.ERR_INVALID_REQUEST,
          message: `Action '${gatewayRequest.action}' does not support streaming`,
        },
        metadata: baseMetadata,
      };
    }

    const constraints = permission.constraints as Record<
      string,
      unknown
    > | null;

    // Invariant: an action with enforcement entries requires a parseable
    // JSON object body — malformed payloads cannot bypass enforcement
    const hasEnforcement = Object.keys(actionSpec.enforce ?? {}).length > 0;
    if (hasEnforcement && gatewayRequest.input === undefined) {
      return {
        success: false,
        decision: RequestDecision.DENIED_CONSTRAINT,
        decisionReason: "Body required for enforced action",
        error: {
          status: 400,
          code: ErrorCode.ERR_INVALID_REQUEST,
          message: "A JSON request body is required for this action",
        },
        metadata: baseMetadata,
      };
    }

    const enforcementResult = applyEnforcement(
      actionSpec,
      connector,
      constraints,
      gatewayRequest.input,
    );

    if (!enforcementResult.allowed) {
      log.warn("Policy enforcement failed", {
        resourceId: gatewayRequest.resourceId,
        action: gatewayRequest.action,
        violation: enforcementResult.violation,
      });
      const isBadRequest =
        enforcementResult.violation.code === ErrorCode.ERR_INVALID_REQUEST;
      return {
        success: false,
        decision: RequestDecision.DENIED_CONSTRAINT,
        decisionReason: enforcementResult.violation.message,
        error: {
          status: isBadRequest ? 400 : 403,
          code: enforcementResult.violation.code,
          message: enforcementResult.violation.message,
        },
        metadata: baseMetadata,
      };
    }

    const shapedInput = enforcementResult.body;
    const requestedModel =
      shapedInput && typeof shapedInput === "object"
        ? ((shapedInput as { model?: string }).model ?? undefined)
        : undefined;

    // Model-specific rate limiting (constraints.modelRateLimits)
    if (requestedModel && constraints?.modelRateLimits) {
      const modelRateLimits = constraints.modelRateLimits as Array<{
        model: string;
        maxRequests: number;
        windowSeconds: number;
      }>;

      const modelLimit = modelRateLimits.find(
        (m) =>
          m.model === requestedModel ||
          m.model === requestedModel.replace(/^models\//, ""),
      );

      if (modelLimit) {
        const modelRateLimitResult = await checkRateLimit(
          `rl:${grant.id}:${gatewayRequest.resourceId}:${gatewayRequest.action}:model:${requestedModel}`,
          modelLimit.maxRequests,
          modelLimit.windowSeconds,
        );

        if (!modelRateLimitResult.allowed) {
          return {
            success: false,
            decision: RequestDecision.DENIED_RATE_LIMIT,
            decisionReason: `Model rate limit exceeded for '${requestedModel}'`,
            error: {
              status: 429,
              code: ErrorCode.ERR_RATE_LIMIT_EXCEEDED,
              message: `Rate limit exceeded for model '${requestedModel}'. Remaining: ${modelRateLimitResult.remaining}`,
            },
            metadata: { ...baseMetadata, model: requestedModel },
          };
        }
      }
    }

    // ============================================
    // STAGE 9: Resolve Credentials & Execute (single egress choke point)
    // ============================================
    const resourceSecret = await prisma.resourceSecret.findUnique({
      where: { resourceId: gatewayRequest.resourceId },
    });

    if (!resourceSecret || resourceSecret.status !== "ACTIVE") {
      return {
        success: false,
        decision: RequestDecision.ERROR,
        decisionReason: `Resource ${gatewayRequest.resourceId} not configured`,
        error: {
          status: 500,
          code: ErrorCode.ERR_RESOURCE_NOT_CONFIGURED,
          message: `Resource '${gatewayRequest.resourceId}' is not configured`,
        },
        metadata: baseMetadata,
      };
    }

    // Decrypt only inside the execute scope
    const secret = decryptSecret({
      encryptedKey: resourceSecret.encryptedKey,
      keyIv: resourceSecret.keyIv,
    });

    // Credential fields (organization, baseUrl override, ...) live in
    // ResourceSecret.config; a baseUrl override applies over the frozen
    // connector config but stays subject to the egress pin below.
    const secretConfig =
      (resourceSecret.config as Record<string, unknown> | null) ?? {};
    const credentials: Record<string, string> = { apiKey: secret };
    for (const [key, value] of Object.entries(secretConfig)) {
      if (typeof value === "string") credentials[key] = value;
    }
    const effectiveConfig: Record<string, unknown> = {
      ...connector.config,
      ...(typeof secretConfig.baseUrl === "string" && {
        baseUrl: secretConfig.baseUrl,
      }),
    };

    try {
      const built = adapter.buildRequest(
        actionSpec,
        shapedInput,
        {
          secret,
          credentials,
          config: effectiveConfig,
          connector,
          subPath: gatewayRequest.subPath,
        },
        { stream: gatewayRequest.stream },
      );

      // EGRESS PIN (hard invariant): outbound requests may only target
      // hosts in the connector's frozen allowedHosts
      const targetHost = new URL(built.url).hostname.toLowerCase();
      const allowedHosts = (connector.allowedHosts ?? []).map((h) =>
        h.toLowerCase(),
      );
      if (!allowedHosts.includes(targetHost)) {
        log.error("Egress guard blocked outbound request", {
          resourceId: gatewayRequest.resourceId,
          targetHost,
        });
        return {
          success: false,
          decision: RequestDecision.ERROR,
          decisionReason: `Egress blocked: ${targetHost} not in allowedHosts`,
          error: {
            status: 502,
            code: ErrorCode.ERR_UPSTREAM_ERROR,
            message: `Refusing to contact '${targetHost}' — not in the connector's allowed hosts`,
          },
          metadata: baseMetadata,
        };
      }

      const upstream = await fetch(built.url, {
        method: built.method,
        headers: built.headers,
        ...(built.body !== undefined && { body: built.body }),
      });

      if (!upstream.ok) {
        throw new UpstreamError(upstream.status, await upstream.text());
      }

      const result = await adapter.parseResponse(actionSpec, upstream, {
        stream: gatewayRequest.stream,
      });

      const latencyMs = Date.now() - startTime;

      // Usage extraction (non-streaming; streaming keeps plugin-era behavior)
      const usage = result.response
        ? extractUsage(actionSpec.usage, result.response)
        : {};
      const modelUsed = usage.model || requestedModel;

      if (usage.totalTokens) {
        recordTokenUsage(permission.id, usage.totalTokens).catch((err) => {
          log.warn("Failed to record token usage", { error: err });
        });
      }

      log.info("Request completed successfully", {
        appId: grant.appId,
        grantId: grant.id,
        resourceId: gatewayRequest.resourceId,
        action: gatewayRequest.action,
        durationMs: latencyMs,
        model: modelUsed,
        tokens: usage.totalTokens,
      });

      return {
        success: true,
        decision: RequestDecision.ALLOWED,
        result: { ...result, usage },
        metadata: {
          ...baseMetadata,
          model: modelUsed,
          latencyMs,
          usage: usage.totalTokens !== undefined || usage.inputTokens !== undefined
            ? {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
              }
            : undefined,
          costEstimate: estimateCost(connector, modelUsed, usage),
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (error instanceof UpstreamError) {
        const mapped = mapUpstreamError(
          connector,
          error.status,
          error.body,
          secret,
        );
        log.error("Upstream request failed", {
          appId: grant.appId,
          grantId: grant.id,
          resourceId: gatewayRequest.resourceId,
          action: gatewayRequest.action,
          errorCode: mapped.code,
          durationMs: latencyMs,
        });
        return {
          success: false,
          decision: RequestDecision.ERROR,
          decisionReason: mapped.message,
          error: mapped,
          metadata: { ...baseMetadata, latencyMs },
        };
      }

      log.error("Adapter execution failed", {
        appId: grant.appId,
        grantId: grant.id,
        resourceId: gatewayRequest.resourceId,
        action: gatewayRequest.action,
        durationMs: latencyMs,
        errorMessage:
          error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        decision: RequestDecision.ERROR,
        decisionReason:
          error instanceof Error ? error.message : "Unknown error",
        error: {
          status: 502,
          code: ErrorCode.ERR_UPSTREAM_ERROR,
          message: "Upstream request failed",
        },
        metadata: { ...baseMetadata, latencyMs },
      };
    }
    } catch (error) {
    const latencyMs = Date.now() - startTime;
    log.errorWithStack(
      "Gateway pipeline error",
      error instanceof Error ? error : new Error(String(error)),
      {
        appId: grant?.appId,
        resourceId: gatewayRequest.resourceId,
        action: gatewayRequest.action,
        durationMs: latencyMs,
      },
    );

    return {
      success: false,
      decision: RequestDecision.ERROR,
      decisionReason: error instanceof Error ? error.message : "Unknown error",
      error: {
        status: 500,
        code: ErrorCode.ERR_INTERNAL,
        message: "An internal error occurred",
      },
      metadata: { appId: grant?.appId, grantId: grant?.id, latencyMs },
    };
  }
}

// ============================================
// COST ESTIMATION (from connector pricing, when present)
// ============================================

function estimateCost(
  connector: ConnectorDocument,
  model: string | undefined,
  usage: { inputTokens?: number; outputTokens?: number },
): number | undefined {
  if (!model || !connector.pricing) return undefined;
  const pricing =
    connector.pricing[model] ??
    connector.pricing[model.replace(/^models\//, "")];
  if (!pricing) return undefined;
  const input = ((usage.inputTokens ?? 0) * pricing.inputPerMTok) / 1_000_000;
  const output =
    ((usage.outputTokens ?? 0) * pricing.outputPerMTok) / 1_000_000;
  return input + output;
}

// ============================================
// AUDIT LOGGING (Async)
// ============================================

export async function logRequest(
  result: GatewayResult,
  resourceId: string,
  action: string,
  endpoint: string,
  method: string,
): Promise<void> {
  try {
    const usage = result.metadata?.usage;
    await prisma.requestLog.create({
      data: {
        appId: result.metadata?.appId,
        grantId: result.metadata?.grantId,
        connectorId: resourceId,
        resourceId,
        action,
        endpoint,
        method,
        decision: result.decision,
        decisionReason: result.decisionReason,
        latencyMs: result.metadata?.latencyMs,
        costEstimate: result.metadata?.costEstimate,
        metadata:
          result.metadata?.model || usage
            ? {
                ...(result.metadata?.model && { model: result.metadata.model }),
                ...(usage?.inputTokens !== undefined && {
                  inputTokens: usage.inputTokens,
                }),
                ...(usage?.outputTokens !== undefined && {
                  outputTokens: usage.outputTokens,
                }),
                ...(usage?.totalTokens !== undefined && {
                  totalTokens: usage.totalTokens,
                }),
              }
            : undefined,
      },
    });
  } catch (error) {
    // Don't fail the request if logging fails
    console.error("Failed to log request:", error);
  }
}
