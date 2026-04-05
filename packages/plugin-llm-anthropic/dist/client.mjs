import {
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
} from "./chunk-ITXUBM43.mjs";

// src/client.ts
function anthropic(transport) {
  return {
    transport,
    async chatCompletions(request, options) {
      const payload = { ...request, stream: false };
      return transport.request(
        PLUGIN_ID,
        "chat.completions",
        payload,
        options
      );
    },
    async chatCompletionsStream(request, options) {
      return transport.requestStream(
        PLUGIN_ID,
        "chat.completions",
        request,
        options
      );
    }
  };
}
var client_default = anthropic;
export {
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
  anthropic,
  client_default as default
};
//# sourceMappingURL=client.mjs.map