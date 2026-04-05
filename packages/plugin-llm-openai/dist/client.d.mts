import { GatewayRequestOptions, GatewayResponse, GatewayStreamResponse, GatewayTransport } from '@glueco/sdk';
import { ChatCompletionRequest, ChatCompletionResponse } from './contracts.mjs';
export { ACTIONS, ChatCompletionChoice, ChatCompletionChoiceSchema, ChatCompletionChunk, ChatCompletionChunkSchema, ChatCompletionRequestSchema, ChatCompletionResponseSchema, ChatMessage, ChatMessageSchema, DEFAULT_API_URL, DEFAULT_OPENAI_MODELS, ENFORCEMENT_SUPPORT, OpenAIAction, PLUGIN_ID, PROVIDER, RESOURCE_TYPE, Tool, ToolSchema, Usage, UsageSchema, VERSION } from './contracts.mjs';
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
 * OpenAI client interface.
 * Provides typed methods for all supported actions.
 */
interface OpenAIClient {
    /**
     * Create a chat completion.
     *
     * @param request - Chat completion request (OpenAI format)
     * @param options - Optional request options
     * @returns Chat completion response
     *
     * @example
     * ```ts
     * const response = await openaiClient.chatCompletions({
     *   model: "gpt-4o",
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
     * const response = await openaiClient.chatCompletionsStream({
     *   model: "gpt-4o",
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
 * Create a typed OpenAI client.
 *
 * @param transport - Gateway transport from SDK
 * @returns Typed OpenAI client
 *
 * @example
 * ```ts
 * import { openai } from "@glueco/plugin-llm-openai/client";
 * import { createTransport } from "@glueco/sdk";
 *
 * // Create transport (uses GLUECO_PRIVATE_KEY from env)
 * const transport = createTransport({
 *   proxyUrl: "https://gateway.example.com",
 *   appId: "app_abc123",
 * });
 *
 * // Create typed client
 * const openaiClient = openai(transport);
 *
 * // Use with full type safety
 * const response = await openaiClient.chatCompletions({
 *   model: "gpt-4o",
 *   messages: [{ role: "user", content: "Hello!" }]
 * });
 * ```
 */
declare function openai(transport: GatewayTransport): OpenAIClient;

export { type ChatCompletionOptions, ChatCompletionRequest, ChatCompletionResponse, type OpenAIClient, openai as default, openai };
