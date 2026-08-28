# @glueco/sdk

## 1.0.1

### Patch Changes

- d65a6f1: Fix the publish workflow shipping an empty package. `1.0.0` was published without running the build first, so the tarball only contained `package.json` and `README.md` — `dist/` (what `main`/`module`/`types` all point at) never made it in, breaking the import for every consumer. The publish workflow now builds the SDK before `changeset publish`, and `prepublishOnly` does the same as a safety net for any manual publish.
- d65a6f1: Remove `PluginClientFactory` and `PluginClient`, leftover type helpers for the old per-provider npm plugin-package pattern that connectors-as-data replaced. Neither was exported from the package entry point, so this isn't a breaking change for anyone actually importing from `@glueco/sdk`.

## 1.0.0

### Major Changes

- ed4bfd1: v1.0.0 — the grant-document SDK for the Cookey gateway.

  Breaking changes:

  - `connect()` is gone. Apps now submit a grant document (see the gateway's
    `docs/GRANT_SPEC.md`) via `submitGrant({ pairingString, grant })`, which posts
    to `/api/connect/prepare`. For PoP grants the public key is derived from
    `GLUECO_PRIVATE_KEY` automatically when the document omits it.
  - `ConnectResult` is now `{ approvalUrl, proxyUrl, grantId, expiresAt }` — poll
    `/api/connect/status?session={grantId}` for approval.

  Added:

  - `parsePairingString()` / `createPairingString()` for the `pair::{url}::{code}`
    format.
  - `createGatewayFetch()` / `createGatewayFetchFromEnv()` — a PoP-signing `fetch`
    you can hand to any vendor SDK that accepts a custom fetch.
  - Vendored PoP v1 canonical wire contract: `POP_VERSION`,
    `buildCanonicalRequestV1()`, `getPathWithQuery()` — verified against the
    cross-language `sdks/test-vectors.json`.
  - `generateKeyPair()` is back as a one-time provisioning helper (returns the
    seed and public key; the SDK still stores nothing — keys live in
    `GLUECO_PRIVATE_KEY`).
  - `GatewayError` / `parseGatewayError()` / `isGatewayError()` for structured
    gateway error responses.

  Unchanged: bearer-token (`ck_`) users need no SDK at all — a plain HTTP client
  or an unmodified OpenAI SDK pointed at `{gateway}/r/llm/<provider>/v1` works.

## 0.4.0

### Minor Changes

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

## 0.3.0

### Minor Changes

- 37f9b83: initial release

### Patch Changes

- Updated dependencies [37f9b83]
  - @glueco/shared@0.3.0

## 0.2.1

### Patch Changes

- 184d8bd: test changeset
- Updated dependencies [184d8bd]
  - @glueco/shared@0.2.1

## 0.2.0

### Minor Changes

- cf1a63f: initial release

### Patch Changes

- Updated dependencies [cf1a63f]
  - @glueco/shared@0.2.0
