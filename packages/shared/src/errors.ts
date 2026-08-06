import { z } from "zod";

// ============================================
// ERROR CODES
// Standardized error codes for the gateway
// ============================================

/**
 * Gateway error codes.
 */
export enum ErrorCode {
  // Resource errors
  ERR_RESOURCE_REQUIRED = "ERR_RESOURCE_REQUIRED",
  ERR_UNKNOWN_RESOURCE = "ERR_UNKNOWN_RESOURCE",
  ERR_RESOURCE_NOT_CONFIGURED = "ERR_RESOURCE_NOT_CONFIGURED",
  ERR_UNSUPPORTED_ACTION = "ERR_UNSUPPORTED_ACTION",

  // Auth errors
  ERR_MISSING_AUTH = "ERR_MISSING_AUTH",
  ERR_INVALID_SIGNATURE = "ERR_INVALID_SIGNATURE",
  ERR_EXPIRED_TIMESTAMP = "ERR_EXPIRED_TIMESTAMP",
  ERR_INVALID_NONCE = "ERR_INVALID_NONCE",
  ERR_APP_NOT_FOUND = "ERR_APP_NOT_FOUND",
  ERR_APP_DISABLED = "ERR_APP_DISABLED",

  // Permission errors
  ERR_PERMISSION_DENIED = "ERR_PERMISSION_DENIED",
  ERR_PERMISSION_EXPIRED = "ERR_PERMISSION_EXPIRED",
  ERR_CONSTRAINT_VIOLATION = "ERR_CONSTRAINT_VIOLATION",

  // Rate/budget errors
  ERR_RATE_LIMIT_EXCEEDED = "ERR_RATE_LIMIT_EXCEEDED",
  ERR_BUDGET_EXCEEDED = "ERR_BUDGET_EXCEEDED",

  // Request errors
  ERR_INVALID_REQUEST = "ERR_INVALID_REQUEST",
  ERR_INVALID_JSON = "ERR_INVALID_JSON",
  ERR_CONTRACT_VALIDATION_FAILED = "ERR_CONTRACT_VALIDATION_FAILED",

  // Internal errors
  ERR_INTERNAL = "ERR_INTERNAL",
  ERR_UPSTREAM_ERROR = "ERR_UPSTREAM_ERROR",

  // Pairing errors
  ERR_INVALID_PAIRING_STRING = "ERR_INVALID_PAIRING_STRING",
  ERR_INVALID_CONNECT_CODE = "ERR_INVALID_CONNECT_CODE",
  ERR_SESSION_EXPIRED = "ERR_SESSION_EXPIRED",

  // PoP errors
  ERR_UNSUPPORTED_POP_VERSION = "ERR_UNSUPPORTED_POP_VERSION",

  // Policy violation errors
  ERR_POLICY_VIOLATION = "ERR_POLICY_VIOLATION",
  ERR_MODEL_NOT_ALLOWED = "ERR_MODEL_NOT_ALLOWED",
  ERR_MAX_TOKENS_EXCEEDED = "ERR_MAX_TOKENS_EXCEEDED",
  ERR_TOOLS_NOT_ALLOWED = "ERR_TOOLS_NOT_ALLOWED",
  ERR_STREAMING_NOT_ALLOWED = "ERR_STREAMING_NOT_ALLOWED",

  // Grant/token auth errors
  ERR_INVALID_TOKEN = "ERR_INVALID_TOKEN",
  ERR_TOKEN_EXPIRED = "ERR_TOKEN_EXPIRED",
  ERR_AMBIGUOUS_AUTH = "ERR_AMBIGUOUS_AUTH",

  // Grant state errors (data-plane requests against non-ACTIVE grants)
  ERR_GRANT_PENDING = "ERR_GRANT_PENDING",
  ERR_GRANT_SUSPENDED = "ERR_GRANT_SUSPENDED",
  ERR_GRANT_EXPIRED = "ERR_GRANT_EXPIRED",
  ERR_GRANT_REVOKED = "ERR_GRANT_REVOKED",
  ERR_GRANT_DENIED = "ERR_GRANT_DENIED",

  // Hardening errors
  ERR_BROWSER_BLOCKED = "ERR_BROWSER_BLOCKED",
  ERR_IP_BLOCKED = "ERR_IP_BLOCKED",

  // Claim codes
  ERR_INVALID_CLAIM_CODE = "ERR_INVALID_CLAIM_CODE",
  ERR_CLAIM_CODE_USED = "ERR_CLAIM_CODE_USED",
}

/**
 * Get HTTP status code for an error code.
 */
export function getErrorStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.ERR_RESOURCE_REQUIRED:
    case ErrorCode.ERR_INVALID_REQUEST:
    case ErrorCode.ERR_INVALID_JSON:
    case ErrorCode.ERR_CONSTRAINT_VIOLATION:
    case ErrorCode.ERR_INVALID_PAIRING_STRING:
    case ErrorCode.ERR_INVALID_CONNECT_CODE:
      return 400;

    case ErrorCode.ERR_CONTRACT_VALIDATION_FAILED:
      return 422;

    case ErrorCode.ERR_MISSING_AUTH:
    case ErrorCode.ERR_INVALID_SIGNATURE:
    case ErrorCode.ERR_EXPIRED_TIMESTAMP:
    case ErrorCode.ERR_INVALID_NONCE:
    case ErrorCode.ERR_INVALID_TOKEN:
    case ErrorCode.ERR_TOKEN_EXPIRED:
      return 401;

    case ErrorCode.ERR_AMBIGUOUS_AUTH:
      return 400;

    case ErrorCode.ERR_PERMISSION_DENIED:
    case ErrorCode.ERR_PERMISSION_EXPIRED:
    case ErrorCode.ERR_APP_DISABLED:
    case ErrorCode.ERR_GRANT_PENDING:
    case ErrorCode.ERR_GRANT_SUSPENDED:
    case ErrorCode.ERR_GRANT_EXPIRED:
    case ErrorCode.ERR_GRANT_REVOKED:
    case ErrorCode.ERR_GRANT_DENIED:
    case ErrorCode.ERR_BROWSER_BLOCKED:
    case ErrorCode.ERR_IP_BLOCKED:
      return 403;

    case ErrorCode.ERR_INVALID_CLAIM_CODE:
      return 400;

    case ErrorCode.ERR_CLAIM_CODE_USED:
      return 410;

    case ErrorCode.ERR_APP_NOT_FOUND:
    case ErrorCode.ERR_UNKNOWN_RESOURCE:
    case ErrorCode.ERR_UNSUPPORTED_ACTION:
      return 404;

    case ErrorCode.ERR_SESSION_EXPIRED:
      return 410;

    case ErrorCode.ERR_UNSUPPORTED_POP_VERSION:
      return 400;

    case ErrorCode.ERR_POLICY_VIOLATION:
    case ErrorCode.ERR_MODEL_NOT_ALLOWED:
    case ErrorCode.ERR_MAX_TOKENS_EXCEEDED:
    case ErrorCode.ERR_TOOLS_NOT_ALLOWED:
    case ErrorCode.ERR_STREAMING_NOT_ALLOWED:
      return 403;

    case ErrorCode.ERR_RATE_LIMIT_EXCEEDED:
    case ErrorCode.ERR_BUDGET_EXCEEDED:
      return 429;

    case ErrorCode.ERR_RESOURCE_NOT_CONFIGURED:
    case ErrorCode.ERR_INTERNAL:
    case ErrorCode.ERR_UPSTREAM_ERROR:
      return 500;

    default:
      return 500;
  }
}

/**
 * Gateway error class.
 */
export class GatewayError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;
  public readonly requestId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: Record<string, unknown>;
      requestId?: string;
    },
  ) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.status = getErrorStatus(code);
    this.details = options?.details;
    this.requestId = options?.requestId;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.requestId && { requestId: this.requestId }),
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * Create a resource required error with helpful message.
 */
export function resourceRequiredError(hint?: string): GatewayError {
  const message = hint
    ? `Resource not specified. ${hint}`
    : "Resource not specified. Set baseURL to /r/<resourceType>/<provider>/v1 or provide x-gateway-resource header.";

  return new GatewayError(ErrorCode.ERR_RESOURCE_REQUIRED, message, {
    details: {
      examples: {
        groq: "/r/llm/groq/v1/chat/completions",
        gemini: "/r/llm/gemini/v1/chat/completions",
        header: "x-gateway-resource: llm:groq",
      },
    },
  });
}

// ============================================
// ERROR RESPONSE SCHEMA
// Standard error response format for all API errors
// ============================================

/**
 * Standard error response schema.
 * All API errors should conform to this shape.
 */
export const GatewayErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type GatewayErrorResponse = z.infer<typeof GatewayErrorResponseSchema>;

/**
 * Create a standard error response object.
 */
export function createErrorResponse(
  code: string,
  message: string,
  options?: {
    requestId?: string;
    details?: unknown;
  },
): GatewayErrorResponse {
  return {
    error: {
      code,
      message,
      ...(options?.requestId && { requestId: options.requestId }),
      ...(options?.details !== undefined && { details: options.details }),
    },
  };
}
