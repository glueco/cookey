// ============================================
// ANTHROPIC PLUGIN - MAIN ENTRYPOINT
// ============================================
//
// This file provides backward compatibility for existing imports.
// For new code, prefer using the specific entrypoints:
//
// Proxy (server-side):
//   import anthropicPlugin from "@glueco/plugin-llm-anthropic/proxy"
//
// Client (target apps):
//   import { anthropic } from "@glueco/plugin-llm-anthropic/client"
//
// ============================================

// Re-export proxy plugin as default for backward compatibility
export { default } from "./proxy";
export { anthropicPlugin } from "./proxy";

// Re-export contracts
export * from "./contracts";
