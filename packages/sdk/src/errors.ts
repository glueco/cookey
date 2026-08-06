// ============================================
// SDK ERROR TYPES
// Client-side error handling for gateway responses.
// Zero dependencies — the error envelope is checked structurally.
// ============================================

/**
 * Error thrown when the gateway returns an error response.
 * Contains structured error information from the gateway.
 */
export class GatewayError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly requestId?: string;
  public readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    status: number,
    options?: {
      requestId?: string;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.status = status;
    this.requestId = options?.requestId;
    this.details = options?.details;
  }

  /**
   * Check if this error matches a specific error code.
   */
  is(code: string): boolean {
    return this.code === code;
  }

  /**
   * Convert to a plain object for logging/serialization.
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      ...(this.requestId && { requestId: this.requestId }),
      ...(this.details !== undefined && { details: this.details }),
    };
  }
}

/**
 * Parse a gateway error response and create a GatewayError.
 * Returns null if the response doesn't match the expected
 * { error: { code, message, requestId?, details? } } envelope.
 */
export function parseGatewayError(
  body: unknown,
  status: number,
): GatewayError | null {
  if (typeof body !== "object" || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;

  const { code, message, requestId, details } = error as {
    code?: unknown;
    message?: unknown;
    requestId?: unknown;
    details?: unknown;
  };
  if (typeof code !== "string" || typeof message !== "string") return null;

  return new GatewayError(code, message, status, {
    requestId: typeof requestId === "string" ? requestId : undefined,
    details,
  });
}

/**
 * Type guard to check if an error is a GatewayError.
 */
export function isGatewayError(error: unknown): error is GatewayError {
  return error instanceof GatewayError;
}
