// ============================================
// ANTHROPIC PLUGIN CLIENT
// Typed client wrapper for target apps
// ============================================
//
// This module provides typed client wrappers for the Anthropic LLM plugin.
// It depends only on the SDK transport interface and shared contracts.
//
// Usage:
// ```ts
// import { anthropic } from "@glueco/plugin-llm-anthropic/client";
// import { createTransport } from "@glueco/sdk";
//
// const transport = createTransport({
//   proxyUrl: "...",
//   appId: "...",
// });
// const claudeClient = anthropic(transport);
//
// const response = await claudeClient.chatCompletions({
//   model: "claude-3-5-sonnet-20241022",
//   messages: [{ role: "user", content: "Hello!" }]
// });
// ```
// ============================================

import type {
  GatewayTransport,
  GatewayResponse,
  GatewayStreamResponse,
  GatewayRequestOptions,
} from "@glueco/sdk";

import {
  type ChatCompletionRequest,
  type ChatCompletionResponse,
  PLUGIN_ID,
} from "./contracts";

// Re-export contracts for consumer convenience
export * from "./contracts";

// ============================================
// CLIENT TYPES
// ============================================

/**
 * Options for chat completion requests.
 */
export interface ChatCompletionOptions extends Omit<
  GatewayRequestOptions,
  "stream" | "method"
> {
  /**
   * Override for custom behavior (advanced usage).
   */
  raw?: boolean;
}

/**
 * Anthropic client interface.
 * Provides typed methods for all supported actions.
 */
export interface AnthropicClient {
  /**
   * Create a chat completion.
   *
   * @param request - Chat completion request (OpenAI-compatible format)
   * @param options - Optional request options
   * @returns Chat completion response
   *
   * @example
   * ```ts
   * const response = await claudeClient.chatCompletions({
   *   model: "claude-3-5-sonnet-20241022",
   *   messages: [
   *     { role: "system", content: "You are a helpful assistant." },
   *     { role: "user", content: "What is the capital of France?" }
   *   ],
   *   temperature: 0.7,
   *   max_tokens: 1000
   * });
   *
   * console.log(response.data.choices[0].message.content);
   * ```
   */
  chatCompletions(
    request: ChatCompletionRequest,
    options?: ChatCompletionOptions,
  ): Promise<GatewayResponse<ChatCompletionResponse>>;

  /**
   * Create a streaming chat completion.
   *
   * @param request - Chat completion request (stream flag will be set automatically)
   * @param options - Optional request options
   * @returns Streaming response with SSE stream
   *
   * @example
   * ```ts
   * const response = await claudeClient.chatCompletionsStream({
   *   model: "claude-3-5-sonnet-20241022",
   *   messages: [{ role: "user", content: "Tell me a story" }]
   * });
   *
   * const reader = response.stream.getReader();
   * const decoder = new TextDecoder();
   *
   * while (true) {
   *   const { done, value } = await reader.read();
   *   if (done) break;
   *   const chunk = decoder.decode(value);
   *   // Process SSE chunk
   * }
   * ```
   */
  chatCompletionsStream(
    request: Omit<ChatCompletionRequest, "stream">,
    options?: ChatCompletionOptions,
  ): Promise<GatewayStreamResponse>;

  /**
   * Get the underlying transport for advanced usage.
   * Useful when you need direct access to the gateway.
   */
  readonly transport: GatewayTransport;
}

// ============================================
// CLIENT FACTORY
// ============================================

/**
 * Create a typed Anthropic client.
 *
 * @param transport - Gateway transport from SDK
 * @returns Typed Anthropic client
 *
 * @example
 * ```ts
 * import { anthropic } from "@glueco/plugin-llm-anthropic/client";
 * import { createTransport } from "@glueco/sdk";
 *
 * // Create transport (uses GLUECO_PRIVATE_KEY from env)
 * const transport = createTransport({
 *   proxyUrl: "https://gateway.example.com",
 *   appId: "app_abc123",
 * });
 *
 * // Create typed client
 * const claudeClient = anthropic(transport);
 *
 * // Use with full type safety
 * const response = await claudeClient.chatCompletions({
 *   model: "claude-3-5-sonnet-20241022",
 *   messages: [{ role: "user", content: "Hello!" }]
 * });
 * ```
 */
export function anthropic(transport: GatewayTransport): AnthropicClient {
  return {
    transport,

    async chatCompletions(
      request: ChatCompletionRequest,
      options?: ChatCompletionOptions,
    ): Promise<GatewayResponse<ChatCompletionResponse>> {
      // Ensure stream is false for non-streaming requests
      const payload = { ...request, stream: false };

      return transport.request<ChatCompletionResponse, ChatCompletionRequest>(
        PLUGIN_ID,
        "chat.completions",
        payload,
        options,
      );
    },

    async chatCompletionsStream(
      request: Omit<ChatCompletionRequest, "stream">,
      options?: ChatCompletionOptions,
    ): Promise<GatewayStreamResponse> {
      return transport.requestStream(
        PLUGIN_ID,
        "chat.completions",
        request,
        options,
      );
    },
  };
}

// Default export for convenient importing
export default anthropic;
