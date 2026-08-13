# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-08-13

### ⚠️ Breaking Changes

- **`connect()` removed** — apps now submit a grant document (see the gateway's
  `docs/GRANT_SPEC.md`) via `submit_grant(pairing_string, grant)`, which posts to
  `/api/connect/prepare`. For PoP grants the public key is derived from
  `GLUECO_PRIVATE_KEY` when the document omits it.
- **`handle_callback()` removed** — poll
  `{proxy_url}/api/connect/status?session={grant_id}` instead.
- `submit_grant()` returns `{approval_url, proxy_url, grant_id, expires_at}` —
  no secrets.

### ✨ Added

- `parse_pairing_string()` / `create_pairing_string()` for the
  `pair::{url}::{code}` format.
- PoP v1 canonical signing verified against the cross-language
  `sdks/test-vectors.json` vectors.
- `GatewayError` / `parse_gateway_error()` for structured gateway errors;
  `ConnectError` for grant-submission failures.
- `transport.request_stream()` streaming with `iter_lines()`.

Bearer-token (`ck_`) users still need no SDK — any HTTP client or the
unmodified `openai` package pointed at `{gateway}/r/llm/<provider>/v1` works.

## [0.4.0] - 2026-02-09

### ⚠️ Breaking Changes

- **Env-only key model**: SDK now uses `GLUECO_PRIVATE_KEY` environment variable
- **Removed** `generate_keypair()` - SDK never generates keys
- **Removed** all storage abstractions (`KeyStorage`, `ConfigStorage`, etc.)
- **Removed** `GatewayClient` class
- **`connect()` no longer returns keypair** - only `approval_url`, `proxy_url`, `expires_at`

### ✨ Added

- **`keys.py`** - `load_seed_from_env()`, `public_key_from_seed()`, validation
- **`create_transport(proxy_url, app_id)`** - Simple transport constructor
- Clear error messages for missing/invalid `GLUECO_PRIVATE_KEY`

### 📖 How it works now

1. App provisions one Ed25519 key in `GLUECO_PRIVATE_KEY`
2. SDK derives public key and sends to proxy during connect
3. Proxy stores public key with app_id
4. All requests signed with env key, verified by proxy

App persists only: `{app_id, proxy_url}`

## [0.3.0] - 2026-02-09

### Added
- GatewayTransport protocol
- Storage abstractions (removed in 0.4.0)
- Streaming support

## [0.2.0] - 2026-02-08

### Added
- Initial release with LLM support
