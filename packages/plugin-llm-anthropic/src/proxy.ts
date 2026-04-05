// ============================================
// ANTHROPIC PLUGIN PROXY
// Server-side plugin implementation for the gateway
// ============================================
//
// This module is imported by the proxy to handle Anthropic requests.
// It should NOT be imported by target apps.
//
// Import path: @glueco/plugin-llm-anthropic/proxy
// ============================================

import type {
  PluginContract,
  PluginResourceConstraints,
  PluginValidationResult,
  PluginExecuteContext,
  PluginExecuteOptions,
  PluginExecuteResult,
  PluginUsageMetrics,
  PluginMappedError,
  EnforcementFields,
} from "@glueco/shared";
import { createPluginBase } from "@glueco/shared";

import {
  ChatCompletionRequestSchema,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
  PLUGIN_ID,
  RESOURCE_TYPE,
  PROVIDER,
  VERSION,
  DEFAULT_ANTHROPIC_MODELS,
  ACTIONS,
  ENFORCEMENT_SUPPORT,
} from "./contracts";

// ============================================
// CONFIGURATION
// ============================================

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_API_VERSION = "2023-06-01";

// ============================================
// ERROR HANDLING
// ============================================

class AnthropicApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Anthropic API error: ${status}`);
    this.name = "AnthropicApiError";
  }
}

function mapAnthropicError(error: AnthropicApiError): PluginMappedError {
  let parsed: { error?: { message?: string; type?: string } } = {};
  try {
    parsed = JSON.parse(error.body);
  } catch {
    // Ignore parse errors
  }

  const message = parsed.error?.message || error.body;

  switch (error.status) {
    case 400:
      return { status: 400, code: "BAD_REQUEST", message, retryable: false };
    case 401:
      return {
        status: 401,
        code: "UNAUTHORIZED",
        message: "Invalid API key",
        retryable: false,
      };
    case 403:
      return { status: 403, code: "FORBIDDEN", message, retryable: false };
    case 404:
      return { status: 404, code: "NOT_FOUND", message, retryable: false };
    case 429:
      return { status: 429, code: "RATE_LIMITED", message, retryable: true };
    case 500:
    case 502:
    case 503:
      return {
        status: error.status,
        code: "PROVIDER_ERROR",
        message,
        retryable: true,
      };
    case 529:
      return {
        status: 529,
        code: "OVERLOADED",
        message: "Anthropic API is overloaded",
        retryable: true,
      };
    default:
      return {
        status: error.status,
        code: "UNKNOWN",
        message,
        retryable: false,
      };
  }
}

// ============================================
// FORMAT CONVERSION
// ============================================

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: "text" | "image" | "tool_use" | "tool_result";
  text?: string;
  source?: { type: "base64"; media_type: string; data: string };
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  stop_sequences?: string[];
  tools?: AnthropicTool[];
  tool_choice?: { type: "auto" | "any" | "tool"; name?: string };
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Convert OpenAI-style messages to Anthropic format.
 * Extracts system message and converts remaining messages.
 */
function convertToAnthropicFormat(request: ChatCompletionRequest): {
  messages: AnthropicMessage[];
  system?: string;
} {
  let system: string | undefined;
  const messages: AnthropicMessage[] = [];

  for (const msg of request.messages) {
    if (msg.role === "system") {
      // Extract system message
      system = typeof msg.content === "string" ? msg.content : "";
    } else if (msg.role === "user" || msg.role === "assistant") {
      const content =
        typeof msg.content === "string" ? msg.content : msg.content ?? "";
      messages.push({
        role: msg.role,
        content: Array.isArray(content)
          ? content.map((c) => ({
              type: "text" as const,
              text: c.text || "",
            }))
          : content,
      });
    } else if (msg.role === "tool" && msg.tool_call_id) {
      // Convert tool response
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id,
            content: typeof msg.content === "string" ? msg.content : "",
          },
        ],
      });
    }
  }

  return { messages, system };
}

/**
 * Convert OpenAI-style tools to Anthropic format.
 */
function convertTools(
  tools?: ChatCompletionRequest["tools"],
): AnthropicTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description || "",
    input_schema: (tool.function.parameters as Record<string, unknown>) || {
      type: "object",
      properties: {},
    },
  }));
}

/**
 * Convert tool_choice to Anthropic format.
 */
function convertToolChoice(
  toolChoice?: ChatCompletionRequest["tool_choice"],
): AnthropicRequest["tool_choice"] | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice === "none") return undefined;
  if (toolChoice === "auto") return { type: "auto" };
  if (toolChoice === "required") return { type: "any" };
  if (typeof toolChoice === "object" && toolChoice.function?.name) {
    return { type: "tool", name: toolChoice.function.name };
  }
  return undefined;
}

/**
 * Convert Anthropic response to OpenAI format.
 */
function convertToOpenAIFormat(
  anthropicResponse: AnthropicResponse,
): ChatCompletionResponse {
  // Extract text content
  const textBlocks = anthropicResponse.content.filter((b) => b.type === "text");
  const content = textBlocks.map((b) => b.text || "").join("");

  // Extract tool calls
  const toolUseBlocks = anthropicResponse.content.filter(
    (b) => b.type === "tool_use",
  );
  const toolCalls =
    toolUseBlocks.length > 0
      ? toolUseBlocks.map((b) => ({
          id: b.id || "",
          type: "function" as const,
          function: {
            name: b.name || "",
            arguments: JSON.stringify(b.input || {}),
          },
        }))
      : undefined;

  // Map stop reason
  let finishReason: string | null = null;
  switch (anthropicResponse.stop_reason) {
    case "end_turn":
      finishReason = "stop";
      break;
    case "max_tokens":
      finishReason = "length";
      break;
    case "tool_use":
      finishReason = "tool_calls";
      break;
    default:
      finishReason = anthropicResponse.stop_reason;
  }

  return {
    id: anthropicResponse.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: anthropicResponse.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: content || null,
          tool_calls: toolCalls,
        },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: anthropicResponse.usage.input_tokens,
      completion_tokens: anthropicResponse.usage.output_tokens,
      total_tokens:
        anthropicResponse.usage.input_tokens +
        anthropicResponse.usage.output_tokens,
    },
  };
}

// ============================================
// STREAMING CONVERTER
// ============================================

/**
 * Transform Anthropic SSE stream to OpenAI-compatible SSE stream.
 */
function createStreamTransformer(): TransformStream<Uint8Array, Uint8Array> {
  let buffer = "";
  let messageId = "";
  let model = "";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) break;

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6);
        if (data === "[DONE]") {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          continue;
        }

        try {
          const event = JSON.parse(data);

          // Handle different Anthropic event types
          if (event.type === "message_start") {
            messageId = event.message?.id || "";
            model = event.message?.model || "";
          } else if (event.type === "content_block_delta") {
            if (event.delta?.type === "text_delta") {
              const openAIChunk = {
                id: messageId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    delta: { content: event.delta.text },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`),
              );
            }
          } else if (event.type === "message_delta") {
            if (event.delta?.stop_reason) {
              let finishReason = "stop";
              if (event.delta.stop_reason === "max_tokens")
                finishReason = "length";
              if (event.delta.stop_reason === "tool_use")
                finishReason = "tool_calls";

              const openAIChunk = {
                id: messageId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: finishReason,
                  },
                ],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`),
              );
            }
          } else if (event.type === "message_stop") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }
        } catch {
          // Ignore parse errors
        }
      }
    },
  });
}

// ============================================
// PLUGIN IMPLEMENTATION
// ============================================

const anthropicPlugin: PluginContract = {
  ...createPluginBase({
    id: PLUGIN_ID,
    resourceType: RESOURCE_TYPE,
    provider: PROVIDER,
    version: VERSION,
    name: "Anthropic Claude",
    actions: [...ACTIONS],
    supports: {
      enforcement: [...ENFORCEMENT_SUPPORT],
    },
    defaultModels: DEFAULT_ANTHROPIC_MODELS,
    client: {
      namespace: "anthropic",
      actions: {
        "chat.completions": {
          description:
            "Generate chat completions using Anthropic Claude models",
        },
      },
    },
  }),

  credentialSchema: {
    fields: [
      {
        name: "apiKey",
        type: "secret",
        label: "API Key",
        description: "Your Anthropic API key",
        required: true,
      },
      {
        name: "baseUrl",
        type: "url",
        label: "Base URL",
        description: "Custom API base URL (optional)",
        required: false,
        default: ANTHROPIC_API_URL,
      },
    ],
  },

  validateAndShape(
    action: string,
    input: unknown,
    constraints: PluginResourceConstraints,
  ): PluginValidationResult {
    if (action !== "chat.completions") {
      return { valid: false, error: `Unsupported action: ${action}` };
    }

    const parsed = ChatCompletionRequestSchema.safeParse(input);
    if (!parsed.success) {
      return {
        valid: false,
        error: `Invalid request: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
      };
    }

    const request = parsed.data;

    const enforcement: EnforcementFields = {
      model: request.model,
      stream: request.stream ?? false,
      usesTools: Array.isArray(request.tools) && request.tools.length > 0,
      maxOutputTokens: request.max_tokens ?? request.max_completion_tokens,
    };

    const allowedModels = constraints.allowedModels ?? [
      ...DEFAULT_ANTHROPIC_MODELS,
    ];
    if (!allowedModels.includes(request.model)) {
      return {
        valid: false,
        error: `Model '${request.model}' not allowed. Allowed: ${allowedModels.join(", ")}`,
      };
    }

    const maxTokens = constraints.maxOutputTokens ?? 4096;
    const requestedTokens = request.max_tokens ?? request.max_completion_tokens;

    if (requestedTokens && requestedTokens > maxTokens) {
      return {
        valid: false,
        error: `max_tokens (${requestedTokens}) exceeds limit (${maxTokens})`,
      };
    }

    if (request.stream && constraints.allowStreaming === false) {
      return {
        valid: false,
        error: "Streaming is not allowed for this app",
      };
    }

    const shapedRequest: ChatCompletionRequest = {
      ...request,
      max_tokens: requestedTokens
        ? Math.min(requestedTokens, maxTokens)
        : maxTokens,
    };

    return { valid: true, shapedInput: shapedRequest, enforcement };
  },

  async execute(
    action: string,
    shapedInput: unknown,
    ctx: PluginExecuteContext,
    options: PluginExecuteOptions,
  ): Promise<PluginExecuteResult> {
    const request = shapedInput as ChatCompletionRequest;
    const baseUrl = (ctx.config?.baseUrl as string) || ANTHROPIC_API_URL;

    // Convert to Anthropic format
    const { messages, system } = convertToAnthropicFormat(request);

    const anthropicRequest: AnthropicRequest = {
      model: request.model,
      max_tokens: request.max_tokens || 4096,
      messages,
      ...(system && { system }),
      ...(request.temperature !== undefined && {
        temperature: request.temperature,
      }),
      ...(request.top_p !== undefined && { top_p: request.top_p }),
      ...(request.stream && { stream: true }),
      ...(request.stop && {
        stop_sequences: Array.isArray(request.stop)
          ? request.stop
          : [request.stop],
      }),
      ...(request.tools && { tools: convertTools(request.tools) }),
      ...(request.tool_choice && {
        tool_choice: convertToolChoice(request.tool_choice),
      }),
    };

    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ctx.secret,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify(anthropicRequest),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AnthropicApiError(response.status, errorBody);
    }

    if (request.stream) {
      // Transform Anthropic SSE to OpenAI-compatible SSE
      const transformedStream = response.body!.pipeThrough(
        createStreamTransformer(),
      );
      return {
        stream: transformedStream,
        contentType: "text/event-stream",
      };
    } else {
      const anthropicResponse =
        (await response.json()) as AnthropicResponse;
      const openAIResponse = convertToOpenAIFormat(anthropicResponse);
      return {
        response: openAIResponse,
        contentType: "application/json",
        usage: this.extractUsage(openAIResponse),
      };
    }
  },

  extractUsage(response: unknown): PluginUsageMetrics {
    const res = response as {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      model?: string;
    };

    return {
      inputTokens: res.usage?.prompt_tokens,
      outputTokens: res.usage?.completion_tokens,
      totalTokens: res.usage?.total_tokens,
      model: res.model,
    };
  },

  mapError(error: unknown): PluginMappedError {
    if (error instanceof AnthropicApiError) {
      return mapAnthropicError(error);
    }

    return {
      status: 500,
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      retryable: false,
    };
  },
};

export default anthropicPlugin;

export { anthropicPlugin };
