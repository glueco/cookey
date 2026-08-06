import { z } from "zod";

// ============================================
// SHARED SCHEMAS
// Validation schemas used by proxy and SDK
// ============================================

/**
 * Chat message schema (OpenAI-compatible).
 */
export const ChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z
    .union([
      z.string(),
      z.array(
        z.object({
          type: z.string(),
          text: z.string().optional(),
          image_url: z
            .object({
              url: z.string(),
              detail: z.string().optional(),
            })
            .optional(),
        }),
      ),
    ])
    .nullable(),
  name: z.string().optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal("function"),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      }),
    )
    .optional(),
  tool_call_id: z.string().optional(),
});

/**
 * Chat completion request schema (OpenAI-compatible).
 */
export const ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  n: z.number().int().min(1).max(10).optional(),
  stream: z.boolean().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  max_tokens: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  logit_bias: z.record(z.number()).optional(),
  user: z.string().optional(),
  tools: z
    .array(
      z.object({
        type: z.literal("function"),
        function: z.object({
          name: z.string(),
          description: z.string().optional(),
          parameters: z.record(z.unknown()).optional(),
        }),
      }),
    )
    .optional(),
  tool_choice: z
    .union([
      z.literal("none"),
      z.literal("auto"),
      z.literal("required"),
      z.object({
        type: z.literal("function"),
        function: z.object({ name: z.string() }),
      }),
    ])
    .optional(),
  response_format: z
    .object({
      type: z.enum(["text", "json_object"]),
    })
    .optional(),
  seed: z.number().int().optional(),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ============================================
// DISCOVERY SCHEMAS
// Resource discovery response types
// ============================================

/**
 * Resource auth configuration in discovery response.
 */
export const ResourceAuthSchema = z.object({
  pop: z.object({
    version: z.number(),
  }),
});

/**
 * Resource entry in discovery response.
 */
export const ResourceDiscoveryEntrySchema = z.object({
  resourceId: z.string(),
  actions: z.array(z.string()),
  auth: ResourceAuthSchema,
  constraints: z
    .object({
      supports: z.array(z.string()),
    })
    .optional(),
});

/**
 * Gateway info in discovery response.
 */
export const GatewayInfoSchema = z.object({
  version: z.string(),
  name: z.string().optional(),
});

/**
 * Full discovery response schema.
 */
export const ResourcesDiscoveryResponseSchema = z.object({
  gateway: GatewayInfoSchema,
  resources: z.array(ResourceDiscoveryEntrySchema),
});

export type ResourcesDiscoveryResponse = z.infer<
  typeof ResourcesDiscoveryResponseSchema
>;
export type ResourceDiscoveryEntry = z.infer<
  typeof ResourceDiscoveryEntrySchema
>;
export type GatewayInfo = z.infer<typeof GatewayInfoSchema>;
