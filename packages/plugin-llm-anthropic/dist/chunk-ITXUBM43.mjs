// src/contracts.ts
import { z } from "zod";
var ChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([
    z.string(),
    z.array(
      z.object({
        type: z.string(),
        text: z.string().optional(),
        image_url: z.object({
          url: z.string(),
          detail: z.string().optional()
        }).optional()
      })
    )
  ]).nullable(),
  name: z.string().optional(),
  tool_calls: z.array(
    z.object({
      id: z.string(),
      type: z.literal("function"),
      function: z.object({
        name: z.string(),
        arguments: z.string()
      })
    })
  ).optional(),
  tool_call_id: z.string().optional()
});
var ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema),
  temperature: z.number().min(0).max(1).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().int().min(1).optional(),
  stream: z.boolean().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  max_tokens: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  tools: z.array(
    z.object({
      type: z.literal("function"),
      function: z.object({
        name: z.string(),
        description: z.string().optional(),
        parameters: z.record(z.unknown()).optional()
      })
    })
  ).optional(),
  tool_choice: z.union([
    z.literal("none"),
    z.literal("auto"),
    z.literal("required"),
    z.object({
      type: z.literal("function"),
      function: z.object({ name: z.string() })
    })
  ]).optional()
});
var ChatCompletionChoiceSchema = z.object({
  index: z.number(),
  message: z.object({
    role: z.literal("assistant"),
    content: z.string().nullable(),
    tool_calls: z.array(
      z.object({
        id: z.string(),
        type: z.literal("function"),
        function: z.object({
          name: z.string(),
          arguments: z.string()
        })
      })
    ).optional()
  }),
  finish_reason: z.string().nullable()
});
var UsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number()
});
var ChatCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  choices: z.array(ChatCompletionChoiceSchema),
  usage: UsageSchema.optional()
});
var ChatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion.chunk"),
  created: z.number(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number(),
      delta: z.object({
        role: z.string().optional(),
        content: z.string().optional(),
        tool_calls: z.array(
          z.object({
            index: z.number(),
            id: z.string().optional(),
            type: z.literal("function").optional(),
            function: z.object({
              name: z.string().optional(),
              arguments: z.string().optional()
            }).optional()
          })
        ).optional()
      }),
      finish_reason: z.string().nullable()
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

export {
  ChatMessageSchema,
  ChatCompletionRequestSchema,
  ChatCompletionChoiceSchema,
  UsageSchema,
  ChatCompletionResponseSchema,
  ChatCompletionChunkSchema,
  PLUGIN_ID,
  RESOURCE_TYPE,
  PROVIDER,
  VERSION,
  DEFAULT_ANTHROPIC_MODELS,
  ACTIONS,
  ENFORCEMENT_SUPPORT
};
//# sourceMappingURL=chunk-ITXUBM43.mjs.map