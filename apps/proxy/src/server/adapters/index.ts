import type { Adapter } from "./types";
import { openAiCompatibleAdapter } from "./openai-compatible";
import { anthropicMessagesAdapter } from "./anthropic-messages";
import { geminiGenerativeAdapter } from "./gemini-generative";
import { mailSendAdapter } from "./mail-send";
import { httpPassthroughAdapter } from "./http-passthrough";

// ============================================
// ADAPTER REGISTRY
// The ~5 wire-protocol implementations built into the gateway.
// Connectors reference these by id; everything else about a provider
// integration is declarative data.
// ============================================

const ADAPTERS: Record<string, Adapter> = {
  [openAiCompatibleAdapter.id]: openAiCompatibleAdapter,
  [anthropicMessagesAdapter.id]: anthropicMessagesAdapter,
  [geminiGenerativeAdapter.id]: geminiGenerativeAdapter,
  [mailSendAdapter.id]: mailSendAdapter,
  [httpPassthroughAdapter.id]: httpPassthroughAdapter,
};

export function getAdapter(id: string): Adapter | undefined {
  return ADAPTERS[id];
}

export function listAdapterIds(): string[] {
  return Object.keys(ADAPTERS);
}

export type { Adapter, AdapterContext, AdapterResult, BuiltRequest } from "./types";
export { UpstreamError } from "./types";
