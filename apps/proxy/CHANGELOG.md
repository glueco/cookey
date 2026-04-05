# @glueco/proxy

## 1.0.1

### Patch Changes

- fb64fd3: ## @glueco/sdk v0.4.0 — Env-Only Key Design

  ### Breaking Changes

  - **Removed**: `generateKeyPair()`, `sign()` — SDK no longer generates or stores keypairs
  - **Removed**: `FileKeyStorage`, `MemoryKeyStorage`, `EnvKeyStorage`, `KeyPair` type
  - **Removed**: `keyStorage` option from `GatewayClient`
  - **Changed**: `connect()` now derives public key from `GLUECO_PRIVATE_KEY` env var instead of managing keypairs
  - **Changed**: `ConnectResult` returns `proxyUrl` instead of `sessionToken` + `keyPair`

  ### New Features

  - **`createTransport()`** — New recommended API for creating PoP-signed transports from environment
  - **`loadSeedFromEnv()`** — Load Ed25519 seed from `GLUECO_PRIVATE_KEY`
  - **`publicKeyFromSeed()`** — Derive public key from seed
  - **`signWithSeed()` / `signToBase64Url()`** — Sign messages with seed
  - **`generateNonce()`** — Centralized cryptographic nonce generation
  - **`KeyError`** — Dedicated error class for key-related issues
  - **Server-side enforcement** — Throws if used in browser (`window` detected)

  ### Migration

  ```diff
  - import { GatewayClient, FileKeyStorage } from "@glueco/sdk";
  - const client = new GatewayClient({ keyStorage: new FileKeyStorage("...") });
  - const transport = await client.getTransport();
  + import { createTransport } from "@glueco/sdk";
  + const transport = createTransport({ proxyUrl: "...", appId: "..." });
  ```

  ## @glueco/plugin-llm-anthropic v0.1.0

  New plugin for Anthropic Claude models.

  - OpenAI-compatible interface with automatic format conversion
  - Streaming support (Anthropic SSE → OpenAI-compatible chunks)
  - Tool calling support with format translation
  - System message extraction
  - Models: claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus, claude-3-sonnet, claude-3-haiku

  ## Plugin Client Updates

  All plugin `client.ts` files updated to document `createTransport()` usage pattern.

- Updated dependencies [fb64fd3]
  - @glueco/plugin-llm-anthropic@1.0.0
  - @glueco/plugin-llm-groq@1.0.0
  - @glueco/plugin-llm-openai@1.0.0
  - @glueco/plugin-llm-gemini@1.0.0
  - @glueco/plugin-mail-resend@1.0.0
