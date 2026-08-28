// ============================================
// GATEWAY TRANSPORT INTERFACE
// The signed-request interface createTransport() returns: PoP signing,
// base URL handling, and error parsing, behind a single typed
// request()/requestStream() call keyed by resourceId + action.
// ============================================

/**
 * Request options for gateway transport.
 */
export interface GatewayRequestOptions {
  /** HTTP method override (default: POST) */
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

  /** Custom headers to include */
  headers?: Record<string, string>;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** AbortSignal for cancellation */
  signal?: AbortSignal;

  /** Enable streaming response */
  stream?: boolean;
}

/**
 * Response from gateway transport.
 */
export interface GatewayResponse<T = unknown> {
  /** Response data (for non-streaming) */
  data: T;

  /** Response status code */
  status: number;

  /** Response headers */
  headers: Record<string, string>;
}

/**
 * Streaming response from gateway transport.
 */
export interface GatewayStreamResponse {
  /** Readable stream of response data */
  stream: ReadableStream<Uint8Array>;

  /** Response status code */
  status: number;

  /** Response headers */
  headers: Record<string, string>;
}

/**
 * Gateway Transport Interface
 *
 * Returned by createTransport(). Abstracts away PoP signing, baseURL
 * handling, and error parsing behind a single typed call.
 *
 * @example
 * ```ts
 * const transport = createTransport({ proxyUrl, appId });
 * const { data } = await transport.request<ChatResponse>(
 *   "llm:gemini",
 *   "chat.completions",
 *   payload
 * );
 * ```
 */
export interface GatewayTransport {
  /**
   * Make a typed request to a resource action.
   *
   * @param resourceId - Resource identifier (e.g., "llm:gemini")
   * @param action - Action name (e.g., "chat.completions")
   * @param payload - Request payload (will be JSON serialized)
   * @param options - Optional request options
   * @returns Promise resolving to typed response
   */
  request<TResponse = unknown, TPayload = unknown>(
    resourceId: string,
    action: string,
    payload: TPayload,
    options?: GatewayRequestOptions,
  ): Promise<GatewayResponse<TResponse>>;

  /**
   * Make a streaming request to a resource action.
   *
   * @param resourceId - Resource identifier (e.g., "llm:gemini")
   * @param action - Action name (e.g., "chat.completions")
   * @param payload - Request payload (will be JSON serialized)
   * @param options - Optional request options
   * @returns Promise resolving to stream response
   */
  requestStream<TPayload = unknown>(
    resourceId: string,
    action: string,
    payload: TPayload,
    options?: Omit<GatewayRequestOptions, "stream">,
  ): Promise<GatewayStreamResponse>;

  /**
   * Get the base proxy URL.
   * Useful for constructing URLs for vendor SDKs.
   */
  getProxyUrl(): string;

  /**
   * Get the PoP-signed fetch function.
   * Use this when you need to use vendor SDKs that require a custom fetch.
   *
   * @returns Fetch function with PoP signing
   */
  getFetch(): typeof fetch;
}
