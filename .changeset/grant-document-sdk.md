---
"@glueco/sdk": major
---

v1.0.0 — the grant-document SDK for the Cookey gateway.

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
