# Changelog

All notable changes to this project will be documented in this file.

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
