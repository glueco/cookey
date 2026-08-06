import { z } from "zod";
import type { Adapter, AdapterContext } from "./types";
import type { ActionSpec } from "@/server/connectors/schema";
import type { ChatCompletionRequest } from "@glueco/shared";

// ============================================
// anthropic-messages ADAPTER
// Translates OpenAI-style chat bodies → Anthropic /v1/messages
// (system-message extraction, x-api-key + anthropic-version headers)
// and translates responses AND SSE stream chunks back to OpenAI shape.
// Ported from @glueco/plugin-llm-anthropic.
// ============================================

const configSchema = z.object({
  baseUrl: z.string().url(),
  anthropicVersion: z.string().default("2023-06-01"),
});

// ---- request translation ----

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: "text" | "tool_result";
  text?: string;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

function convertToAnthropicFormat(request: ChatCompletionRequest): {
  messages: AnthropicMessage[];
  system?: string;
} {
  let system: string | undefined;
  const messages: AnthropicMessage[] = [];

  for (const msg of request.messages) {
    if (msg.role === "system") {
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

function convertToolChoice(
  toolChoice?: ChatCompletionRequest["tool_choice"],
): { type: "auto" | "any" | "tool"; name?: string } | undefined {
  if (!toolChoice || toolChoice === "none") return undefined;
  if (toolChoice === "auto") return { type: "auto" };
  if (toolChoice === "required") return { type: "any" };
  if (typeof toolChoice === "object" && toolChoice.function?.name) {
    return { type: "tool", name: toolChoice.function.name };
  }
  return undefined;
}

// ---- response translation ----

interface AnthropicResponse {
  id: string;
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

function convertToOpenAIFormat(anthropicResponse: AnthropicResponse) {
  const textBlocks = anthropicResponse.content.filter((b) => b.type === "text");
  const content = textBlocks.map((b) => b.text || "").join("");

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

  let finishReason: string | null;
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

// ---- stream translation ----

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
                  { index: 0, delta: {}, finish_reason: finishReason },
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
          // Ignore parse errors on individual chunks
        }
      }
    },
  });
}

// ---- adapter ----

export const anthropicMessagesAdapter: Adapter = {
  id: "anthropic-messages",
  configSchema,

  buildRequest(action: ActionSpec, input: unknown, ctx: AdapterContext, opts) {
    const config = ctx.config as { baseUrl: string; anthropicVersion?: string };
    const request = input as ChatCompletionRequest;
    const { messages, system } = convertToAnthropicFormat(request);

    const anthropicRequest = {
      model: request.model,
      max_tokens: request.max_tokens || 4096,
      messages,
      ...(system && { system }),
      ...(request.temperature !== undefined && {
        temperature: request.temperature,
      }),
      ...(request.top_p !== undefined && { top_p: request.top_p }),
      ...(opts.stream && { stream: true }),
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

    return {
      url: `${config.baseUrl.replace(/\/$/, "")}${action.path}`,
      method: action.method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ctx.secret,
        "anthropic-version": config.anthropicVersion ?? "2023-06-01",
      },
      body: JSON.stringify(anthropicRequest),
    };
  },

  async parseResponse(_action, response, opts) {
    if (opts.stream) {
      return {
        stream: response.body!.pipeThrough(createStreamTransformer()),
        contentType: "text/event-stream",
      };
    }
    const anthropicResponse = (await response.json()) as AnthropicResponse;
    return {
      response: convertToOpenAIFormat(anthropicResponse),
      contentType: "application/json",
    };
  },
};
