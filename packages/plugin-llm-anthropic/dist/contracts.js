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

// src/contracts.ts
var contracts_exports = {};
__export(contracts_exports, {
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
  VERSION: () => VERSION
});
module.exports = __toCommonJS(contracts_exports);
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
  VERSION
});
//# sourceMappingURL=contracts.js.map