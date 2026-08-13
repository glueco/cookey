# PoP Protocol v1

Proof-of-possession auth for long-lived grants: the app holds an Ed25519
seed and signs every request; the gateway stores only the public key, so no
bearer credential ever crosses the wire.

This document is **the contract** between the gateway and the SDKs. The
canonical-request code is deliberately vendored in each implementation
(gateway: `apps/proxy/src/shared/`; TS SDK: `packages/sdk/src/canonical.ts`;
Python: `sdks/python/src/glueco_sdk/pop.py`) and kept in lockstep by the
shared test vectors in [`sdks/test-vectors.json`](../sdks/test-vectors.json),
which all three test suites consume.

## Headers

Every signed request carries:

| Header | Value |
|---|---|
| `x-pop-v` | `1` |
| `x-app-id` | The app id issued at approval |
| `x-ts` | Unix seconds; must be within ±90s of server time |
| `x-nonce` | ≥16 chars, unique per request (replay-checked server-side) |
| `x-sig` | Ed25519 signature over the canonical request, base64 or base64url |

## Canonical request

```
v1\n
<METHOD uppercased>\n
<PATH_WITH_QUERY>\n            e.g. /r/llm/groq/v1/chat/completions?stream=true
<APP_ID>\n
<TS>\n
<NONCE>\n
<BODY_HASH>\n                  base64url( SHA-256( raw body bytes ) ), empty body hashes too
```

(seven lines joined with `\n`, plus a trailing newline — i.e.
`["v1", METHOD, PATH_WITH_QUERY, APP_ID, TS, NONCE, BODY_HASH, ""].join("\n")`).

The signature is Ed25519 over the UTF-8 bytes of that string.

## Server-side verification

1. Headers present; `x-pop-v` must be exactly `1` — anything else
   (including a missing header) is rejected with
   `ERR_UNSUPPORTED_POP_VERSION`.
2. Timestamp within ±90 seconds.
3. Nonce unique — enforced by unique insert into Postgres (`PopNonce`,
   TTL = 2× the timestamp window); a duplicate is a replay → 401
   `ERR_INVALID_NONCE`.
4. App exists, is ACTIVE, and has ≥1 ACTIVE credential.
5. Signature verifies against any ACTIVE credential (supports rotation via
   `POST /api/connect/rotate`).

## Key format

- Seed: 32 random bytes, transported base64 (`GLUECO_PRIVATE_KEY` env var in
  the SDKs — server-side only).
- Public key: 32 raw bytes, base64, carried in the grant document's
  `publicKey` field.

## Test vectors

`sdks/test-vectors.json` pins: a fixed RFC 8032 test seed (never use it in
production), the derived public key, and for each case the body hash,
canonical string, and signature. If an implementation disagrees with a
vector, the implementation is wrong.
