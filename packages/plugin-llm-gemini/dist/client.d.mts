import { GatewayRequestOptions, GatewayResponse, GatewayStreamResponse, GatewayTransport } from '@glueco/sdk';
import { ChatCompletionRequest, ChatCompletionResponse } from './contracts.mjs';
export { ACTIONS, ChatCompletionChoice, ChatCompletionChoiceSchema, ChatCompletionChunk, ChatCompletionChunkSchema, ChatCompletionRequestSchema, ChatCompletionResponseSchema, ChatMessage, ChatMessageSchema, DEFAULT_GEMINI_MODELS, ENFORCEMENT_SUPPORT, GeminiAction, PLUGIN_ID, PROVIDER, RESOURCE_TYPE, Usage, UsageSchema, VERSION } from './contracts.mjs';
import 'zod';

/**
 * Options for chat completion requests.
 */
interface ChatCompletionOptions extends Omit<GatewayRequestOptions, "stream" | "method"> {
    /**
     * Override for custom behavior (advanced usage).
     */
    raw?: boolean;
}
/**
 * Gemini client interface.
 * Provides typed methods for all supported actions.
 */
interface GeminiClient {
    /**
     * Create a chat completion.
     *
     * @param request - Chat completion request (OpenAI-compatible format)
     * @param options - Optional request options
     * @returns Chat completion response
     *
     * @example
     * ```ts
     * const response = await geminiClient.chatCompletions({
     *   model: "gemini-1.5-flash",
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
    chatCompletions(request: ChatCompletionRequest, options?: ChatCompletionOptions): Promise<GatewayResponse<ChatCompletionResponse>>;
    /**
     * Create a streaming chat completion.
     *
     * @param request - Chat completion request (stream flag will be set automatically)
     * @param options - Optional request options
     * @returns Streaming response with SSE stream
     *
     * @example
     * ```ts
     * const response = await geminiClient.chatCompletionsStream({
     *   model: "gemini-1.5-flash",
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
    chatCompletionsStream(request: Omit<ChatCompletionRequest, "stream">, options?: ChatCompletionOptions): Promise<GatewayStreamResponse>;
    /**
     * Get the underlying transport for advanced usage.
     * Useful when you need direct access to the gateway.
     */
    readonly transport: GatewayTransport;
}
/**
 * Create a typed Gemini client.
 *
 * @param transport - Gateway transport from SDK
 * @returns Typed Gemini client
 *
 * @example
 * ```ts
 * import { gemini } from "@glueco/plugin-llm-gemini/client";
 * import { createTransport } from "@glueco/sdk";
 *
 * // Create transport (uses GLUECO_PRIVATE_KEY from env)
 * const transport = createTransport({
 *   proxyUrl: "https://gateway.example.com",
 *   appId: "app_abc123",
 * });
 *
 * // Create typed client
 * const geminiClient = gemini(transport);
 *
 * // Use with full type safety
 * const response = await geminiClient.chatCompletions({
 *   model: "gemini-1.5-flash",
 *   messages: [{ role: "user", content: "Hello!" }]
 * });
 * ```
 */
declare function gemini(transport: GatewayTransport): GeminiClient;

export { type ChatCompletionOptions, ChatCompletionRequest, ChatCompletionResponse, type GeminiClient, gemini as default, gemini };
