# @glueco/plugin-llm-gemini

## 1.0.0

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
  - @glueco/sdk@0.4.0

## 0.1.2

### Patch Changes

- 9ee6efb: corrected model names
- Updated dependencies [9ee6efb]
  - @glueco/shared@0.3.1

## 0.1.1

### Patch Changes

- fd7f8b3: fix peer dependenies by patch

## 2.0.0

### Minor Changes

- 37f9b83: initial release

### Patch Changes

- Updated dependencies [37f9b83]
  - @glueco/sdk@0.3.0
  - @glueco/shared@0.3.0

## 1.0.1

### Patch Changes

- 184d8bd: test changeset
- Updated dependencies [184d8bd]
  - @glueco/sdk@0.2.1
  - @glueco/shared@0.2.1

## 1.0.0

### Minor Changes

- cf1a63f: initial release

### Patch Changes

- Updated dependencies [cf1a63f]
  - @glueco/sdk@0.2.0
  - @glueco/shared@0.2.0
