"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  ACTIONS: () => ACTIONS,
  ChatCompletionChoiceSchema: () => ChatCompletionChoiceSchema,
  ChatCompletionChunkSchema: () => ChatCompletionChunkSchema,
  ChatCompletionRequestSchema: () => ChatCompletionRequestSchema,
  ChatCompletionResponseSchema: () => ChatCompletionResponseSchema,
  ChatMessageSchema: () => ChatMessageSchema,
  DEFAULT_ANTHROPIC_MODELS: () => DEFAULT_ANTHROPIC_MODELS,
  ENFORCEMENT_SUPPORT: () => ENFORCEMENT_SUPPORT,
  PLUGIN_ID: () => PLUGIN_ID,
  PROVIDER: () => PROVIDER,
  RESOURCE_TYPE: () => RESOURCE_TYPE,
  UsageSchema: () => UsageSchema,
  VERSION: () => VERSION,
  anthropicPlugin: () => anthropicPlugin,
  default: () => proxy_default
});
module.exports = __toCommonJS(src_exports);

// src/proxy.ts
var import_shared = require("@glueco/shared");

// src/contracts.ts
var import_zod = require("zod");
var ChatMessageSchema = import_zod.z.object({
  role: import_zod.z.enum(["system", "user", "assistant", "tool"]),
  content: import_zod.z.union([
    import_zod.z.string(),
    import_zod.z.array(
      import_zod.z.object({
        type: import_zod.z.string(),
        text: import_zod.z.string().optional(),
        image_url: import_zod.z.object({
          url: import_zod.z.string(),
          detail: import_zod.z.string().optional()
        }).optional()
      })
    )
  ]).nullable(),
  name: import_zod.z.string().optional(),
  tool_calls: import_zod.z.array(
    import_zod.z.object({
      id: import_zod.z.string(),
      type: import_zod.z.literal("function"),
      function: import_zod.z.object({
        name: import_zod.z.string(),
        arguments: import_zod.z.string()
      })
    })
  ).optional(),
  tool_call_id: import_zod.z.string().optional()
});
var ChatCompletionRequestSchema = import_zod.z.object({
  model: import_zod.z.string(),
  messages: import_zod.z.array(ChatMessageSchema),
  temperature: import_zod.z.number().min(0).max(1).optional(),
  top_p: import_zod.z.number().min(0).max(1).optional(),
  top_k: import_zod.z.number().int().min(1).optional(),
  stream: import_zod.z.boolean().optional(),
  stop: import_zod.z.union([import_zod.z.string(), import_zod.z.array(import_zod.z.string())]).optional(),
  max_tokens: import_zod.z.number().int().positive().optional(),
  max_completion_tokens: import_zod.z.number().int().positive().optional(),
  tools: import_zod.z.array(
    import_zod.z.object({
      type: import_zod.z.literal("function"),
      function: import_zod.z.object({
        name: import_zod.z.string(),
        description: import_zod.z.string().optional(),
        parameters: import_zod.z.record(import_zod.z.unknown()).optional()
      })
    })
  ).optional(),
  tool_choice: import_zod.z.union([
    import_zod.z.literal("none"),
    import_zod.z.literal("auto"),
    import_zod.z.literal("required"),
    import_zod.z.object({
      type: import_zod.z.literal("function"),
      function: import_zod.z.object({ name: import_zod.z.string() })
    })
  ]).optional()
});
var ChatCompletionChoiceSchema = import_zod.z.object({
  index: import_zod.z.number(),
  message: import_zod.z.object({
    role: import_zod.z.literal("assistant"),
    content: import_zod.z.string().nullable(),
    tool_calls: import_zod.z.array(
      import_zod.z.object({
        id: import_zod.z.string(),
        type: import_zod.z.literal("function"),
        function: import_zod.z.object({
          name: import_zod.z.string(),
          arguments: import_zod.z.string()
        })
      })
    ).optional()
  }),
  finish_reason: import_zod.z.string().nullable()
});
var UsageSchema = import_zod.z.object({
  prompt_tokens: import_zod.z.number(),
  completion_tokens: import_zod.z.number(),
  total_tokens: import_zod.z.number()
});
var ChatCompletionResponseSchema = import_zod.z.object({
  id: import_zod.z.string(),
  object: import_zod.z.literal("chat.completion"),
  created: import_zod.z.number(),
  model: import_zod.z.string(),
  choices: import_zod.z.array(ChatCompletionChoiceSchema),
  usage: UsageSchema.optional()
});
var ChatCompletionChunkSchema = import_zod.z.object({
  id: import_zod.z.string(),
  object: import_zod.z.literal("chat.completion.chunk"),
  created: import_zod.z.number(),
  model: import_zod.z.string(),
  choices: import_zod.z.array(
    import_zod.z.object({
      index: import_zod.z.number(),
      delta: import_zod.z.object({
        role: import_zod.z.string().optional(),
        content: import_zod.z.string().optional(),
        tool_calls: import_zod.z.array(
          import_zod.z.object({
            index: import_zod.z.number(),
            id: import_zod.z.string().optional(),
            type: import_zod.z.literal("function").optional(),
            function: import_zod.z.object({
              name: import_zod.z.string().optional(),
              arguments: import_zod.z.string().optional()
            }).optional()
          })
        ).optional()
      }),
      finish_reason: import_zod.z.string().nullable()
    })
  )
});
var PLUGIN_ID = "llm:anthropic";
var RESOURCE_TYPE = "llm";
var PROVIDER = "anthropic";
var VERSION = "1.0.0";
var DEFAULT_ANTHROPIC_MODELS = [
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307"
];
var ACTIONS = ["chat.completions"];
var ENFORCEMENT_SUPPORT = [
  "model",
  "max_tokens",
  "streaming"
];

// src/proxy.ts
var ANTHROPIC_API_URL = "https://api.anthropic.com/v1";
var ANTHROPIC_API_VERSION = "2023-06-01";
var AnthropicApiError = class extends Error {
  constructor(status, body) {
    super(`Anthropic API error: ${status}`);
    this.status = status;
    this.body = body;
    this.name = "AnthropicApiError";
  }
};
function mapAnthropicError(error) {
  let parsed = {};
  try {
    parsed = JSON.parse(error.body);
  } catch {
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
        retryable: false
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
        retryable: true
      };
    case 529:
      return {
        status: 529,
        code: "OVERLOADED",
        message: "Anthropic API is overloaded",
        retryable: true
      };
    default:
      return {
        status: error.status,
        code: "UNKNOWN",
        message,
        retryable: false
      };
  }
}
function convertToAnthropicFormat(request) {
  let system;
  const messages = [];
  for (const msg of request.messages) {
    if (msg.role === "system") {
      system = typeof msg.content === "string" ? msg.content : "";
    } else if (msg.role === "user" || msg.role === "assistant") {
      const content = typeof msg.content === "string" ? msg.content : msg.content ?? "";
      messages.push({
        role: msg.role,
        content: Array.isArray(content) ? content.map((c) => ({
          type: "text",
          text: c.text || ""
        })) : content
      });
    } else if (msg.role === "tool" && msg.tool_call_id) {
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id,
            content: typeof msg.content === "string" ? msg.content : ""
          }
        ]
      });
    }
  }
  return { messages, system };
}
function convertTools(tools) {
  if (!tools || tools.length === 0) return void 0;
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description || "",
    input_schema: tool.function.parameters || {
      type: "object",
      properties: {}
    }
  }));
}
function convertToolChoice(toolChoice) {
  if (!toolChoice) return void 0;
  if (toolChoice === "none") return void 0;
  if (toolChoice === "auto") return { type: "auto" };
  if (toolChoice === "required") return { type: "any" };
  if (typeof toolChoice === "object" && toolChoice.function?.name) {
    return { type: "tool", name: toolChoice.function.name };
  }
  return void 0;
}
function convertToOpenAIFormat(anthropicResponse) {
  const textBlocks = anthropicResponse.content.filter((b) => b.type === "text");
  const content = textBlocks.map((b) => b.text || "").join("");
  const toolUseBlocks = anthropicResponse.content.filter(
    (b) => b.type === "tool_use"
  );
  const toolCalls = toolUseBlocks.length > 0 ? toolUseBlocks.map((b) => ({
    id: b.id || "",
    type: "function",
    function: {
      name: b.name || "",
      arguments: JSON.stringify(b.input || {})
    }
  })) : void 0;
  let finishReason = null;
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
    created: Math.floor(Date.now() / 1e3),
    model: anthropicResponse.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: content || null,
          tool_calls: toolCalls
        },
        finish_reason: finishReason
      }
    ],
    usage: {
      prompt_tokens: anthropicResponse.usage.input_tokens,
      completion_tokens: anthropicResponse.usage.output_tokens,
      total_tokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens
    }
  };
}
function createStreamTransformer() {
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
                created: Math.floor(Date.now() / 1e3),
                model,
                choices: [
                  {
                    index: 0,
                    delta: { content: event.delta.text },
                    finish_reason: null
                  }
                ]
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(openAIChunk)}

`)
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
                created: Math.floor(Date.now() / 1e3),
                model,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: finishReason
                  }
                ]
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(openAIChunk)}

`)
              );
            }
          } else if (event.type === "message_stop") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }
        } catch {
        }
      }
    }
  });
}
var anthropicPlugin = {
  ...(0, import_shared.createPluginBase)({
    id: PLUGIN_ID,
    resourceType: RESOURCE_TYPE,
    provider: PROVIDER,
    version: VERSION,
    name: "Anthropic Claude",
    actions: [...ACTIONS],
    supports: {
      enforcement: [...ENFORCEMENT_SUPPORT]
    },
    defaultModels: DEFAULT_ANTHROPIC_MODELS,
    client: {
      namespace: "anthropic",
      actions: {
        "chat.completions": {
          description: "Generate chat completions using Anthropic Claude models"
        }
      }
    }
  }),
  credentialSchema: {
    fields: [
      {
        name: "apiKey",
        type: "secret",
        label: "API Key",
        description: "Your Anthropic API key",
        required: true
      },
      {
        name: "baseUrl",
        type: "url",
        label: "Base URL",
        description: "Custom API base URL (optional)",
        required: false,
        default: ANTHROPIC_API_URL
      }
    ]
  },
  validateAndShape(action, input, constraints) {
    if (action !== "chat.completions") {
      return { valid: false, error: `Unsupported action: ${action}` };
    }
    const parsed = ChatCompletionRequestSchema.safeParse(input);
    if (!parsed.success) {
      return {
        valid: false,
        error: `Invalid request: ${parsed.error.errors.map((e) => e.message).join(", ")}`
      };
    }
    const request = parsed.data;
    const enforcement = {
      model: request.model,
      stream: request.stream ?? false,
      usesTools: Array.isArray(request.tools) && request.tools.length > 0,
      maxOutputTokens: request.max_tokens ?? request.max_completion_tokens
    };
    const allowedModels = constraints.allowedModels ?? [
      ...DEFAULT_ANTHROPIC_MODELS
    ];
    if (!allowedModels.includes(request.model)) {
      return {
        valid: false,
        error: `Model '${request.model}' not allowed. Allowed: ${allowedModels.join(", ")}`
      };
    }
    const maxTokens = constraints.maxOutputTokens ?? 4096;
    const requestedTokens = request.max_tokens ?? request.max_completion_tokens;
    if (requestedTokens && requestedTokens > maxTokens) {
      return {
        valid: false,
        error: `max_tokens (${requestedTokens}) exceeds limit (${maxTokens})`
      };
    }
    if (request.stream && constraints.allowStreaming === false) {
      return {
        valid: false,
        error: "Streaming is not allowed for this app"
      };
    }
    const shapedRequest = {
      ...request,
      max_tokens: requestedTokens ? Math.min(requestedTokens, maxTokens) : maxTokens
    };
    return { valid: true, shapedInput: shapedRequest, enforcement };
  },
  async execute(action, shapedInput, ctx, options) {
    const request = shapedInput;
    const baseUrl = ctx.config?.baseUrl || ANTHROPIC_API_URL;
    const { messages, system } = convertToAnthropicFormat(request);
    const anthropicRequest = {
      model: request.model,
      max_tokens: request.max_tokens || 4096,
      messages,
      ...system && { system },
      ...request.temperature !== void 0 && {
        temperature: request.temperature
      },
      ...request.top_p !== void 0 && { top_p: request.top_p },
      ...request.stream && { stream: true },
      ...request.stop && {
        stop_sequences: Array.isArray(request.stop) ? request.stop : [request.stop]
      },
      ...request.tools && { tools: convertTools(request.tools) },
      ...request.tool_choice && {
        tool_choice: convertToolChoice(request.tool_choice)
      }
    };
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ctx.secret,
        "anthropic-version": ANTHROPIC_API_VERSION
      },
      body: JSON.stringify(anthropicRequest),
      signal: options.signal
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new AnthropicApiError(response.status, errorBody);
    }
    if (request.stream) {
      const transformedStream = response.body.pipeThrough(
        createStreamTransformer()
      );
      return {
        stream: transformedStream,
        contentType: "text/event-stream"
      };
    } else {
      const anthropicResponse = await response.json();
      const openAIResponse = convertToOpenAIFormat(anthropicResponse);
      return {
        response: openAIResponse,
        contentType: "application/json",
        usage: this.extractUsage(openAIResponse)
      };
    }
  },
  extractUsage(response) {
    const res = response;
    return {
      inputTokens: res.usage?.prompt_tokens,
      outputTokens: res.usage?.completion_tokens,
      totalTokens: res.usage?.total_tokens,
      model: res.model
    };
  },
  mapError(error) {
    if (error instanceof AnthropicApiError) {
      return mapAnthropicError(error);
    }
    return {
      status: 500,
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      retryable: false
    };
  }
};
var proxy_default = anthropicPlugin;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ACTIONS,
  ChatCompletionChoiceSchema,
  ChatCompletionChunkSchema,
  ChatCompletionRequestSchema,
  ChatCompletionResponseSchema,
  ChatMessageSchema,
  DEFAULT_ANTHROPIC_MODELS,
  ENFORCEMENT_SUPPORT,
  PLUGIN_ID,
  PROVIDER,
  RESOURCE_TYPE,
  UsageSchema,
  VERSION,
  anthropicPlugin
});
//# sourceMappingURL=index.js.map