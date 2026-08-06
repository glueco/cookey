# Cookey Gateway — Architecture Update Specification

**Status:** Approved plan. This document is the single source of truth for the migration described below.
**Audience:** Coding agent(s) executing the migration, and future maintainers.
**Repo:** `glueco/cookey` (this repository, historically "Glueco Gateway" / "personal-resource-gateway").

---

## Part 1 — Plain-English Goal

### What this product is

Cookey is a **self-hosted personal API gateway**. One person (the "owner") deploys their own instance with one click, stores their paid API keys in it (OpenAI, Groq, Gemini, Anthropic, Resend, anything), and then grants third-party apps **controlled, time-limited, budget-capped access** to those keys — without the apps ever seeing the keys. Every deployment is single-tenant: one owner, their keys, their rules. There is no central service.

The pitch to owners: *"Connect your key safely instead of trusting apps with it."*
The pitch to app developers: *"Build BYOK (bring-your-own-key) apps without asking users to paste raw API keys."*

### What we are changing and why

The current system has two structural problems:

1. **Providers are npm packages.** Adding a provider (e.g. OpenRouter) requires authoring, building, and publishing an npm package, editing `proxy.plugins.ts`, running a codegen script, and redeploying. For a product whose premise is "everyone runs their own deployment," this is unacceptable — a self-hoster cannot extend their gateway without becoming an npm publisher. The five existing plugin packages are ~85% copy-paste of each other; the differences are almost entirely configuration data, not code.

2. **Apps need our SDK to connect.** The PoP (proof-of-possession) auth scheme requires Ed25519 signing code inside every target app, in every language. This was the actual adoption blocker (the Outsmart fork integration stalled precisely here).

### The new system in one paragraph

Provider integrations become **Connectors**: declarative JSON documents installed *at runtime* through the admin UI — from a curated marketplace repo, from any URL, or built by hand in an in-app builder. Connectors reference one of a small number of **Adapters** (real code, built into the gateway, ~5 of them) that know how to speak each wire protocol. App access becomes a **Grant**: a JSON document the app author writes (or generates with a hosted builder page) describing what resources it wants, why, and under what limits; the owner reviews it on a rich approval screen and signs it. Approved grants are authenticated either by a **static bearer token** (zero code in the app — works with any HTTP client or existing OpenAI SDK) or by **PoP** (via a slim signing-only SDK, for long-lived grants). All npm plugin packages are deleted. Redis is removed; Postgres is the only backing service. Vercel one-click deploy remains the primary deployment story.

### Explicitly rejected alternatives (do not re-introduce)

- **Rotating/refresh tokens** — rejected. Rotation requires the target app to persist newly issued tokens at runtime; the target-app ecosystem (Streamlit Cloud, Vercel env vars, Docker env) is read-only-config at runtime, making this impractical. Long-lived grants use PoP instead.
- **Executable plugins fetched at runtime** — rejected. Vercel serverless cannot install packages or execute fetched code safely. Connectors are pure data, always.
- **Code-required SDK as the default connection path** — rejected. Bearer tokens are the default; the SDK exists only for optional PoP.
- **Contractual/attested app-side storage promises** (e.g. a grant field claiming "we hash the token") — rejected as unverifiable theater. Security comes from gateway-side containment and detection, never from counterparty promises.

---

## Part 2 — Current State (what exists today)

Read this to understand what you are modifying. Verify against the code; this summary was accurate at the time of writing.

### Repo layout (current)

```
├── apps/proxy/                  # Next.js 14 App Router gateway (TypeScript)
│   ├── prisma/schema.prisma     # Postgres schema (models listed below)
│   └── src/
│       ├── app/                 # pages + API routes
│       │   ├── api/admin/*      # admin REST (apps, models, pairing, plugins, resources, login)
│       │   ├── api/connect/*    # prepare / approve / rotate / status
│       │   ├── api/resources    # public discovery endpoint
│       │   ├── api/app/status   # app self-status
│       │   ├── connect/approve/ # approval UI (ApprovalForm 330 ln, AdvancedApprovalForm 1151 ln)
│       │   ├── dashboard/page.tsx  # admin dashboard — 2375-line monolith
│       │   └── r/[resourceType]/[provider]/[...path]/route.ts  # data plane
│       ├── lib/                 # db, redis (Upstash), vault (envelope encryption),
│       │                        # crypto, cors, logger, admin-auth, auth-cookie
│       └── server/
│           ├── auth/pop.ts      # PoP verification (x-app-id, x-ts, x-nonce, x-sig, x-pop-v)
│           ├── gateway/         # pipeline.ts (582 ln), enforce.ts, access-policy.ts
│           ├── pairing/         # install session logic
│           └── plugins/         # registry.ts + enabled.generated.ts (codegen output)
├── packages/
│   ├── shared/                  # @glueco/shared — plugin contract, PoP canonical, errors, schemas
│   ├── sdk/                     # @glueco/sdk 0.4.0 — transport, PoP signing, connect helper
│   ├── plugin-llm-groq/         # @glueco/plugin-llm-* 1.0.0 — DELETE (all five + template)
│   ├── plugin-llm-openai/
│   ├── plugin-llm-gemini/
│   ├── plugin-llm-anthropic/
│   ├── plugin-mail-resend/
│   └── plugin-template/
├── examples/demo-target-app/    # Next.js demo consumer using SDK + plugin clients
├── scripts/generate-enabled-plugins.mjs   # DELETE — regex codegen for plugin imports
├── proxy.plugins.ts             # DELETE — build-time plugin enable list
└── docs/                        # ADMIN_GUIDE, DEVELOPER_GUIDE, ADDING_PLUGINS, PACKAGE_ARCHITECTURE, API_REFERENCE
```

Related repos/dirs (context only, not modified by this plan except where stated):

- `../forks/outsmart` — fork of a Streamlit BYOK app; the real-world validation target for the new grant flow.
- `../forks/python-packages/glueco-sdk` — Python SDK 0.4.0 with working PoP signing (`glueco_sdk.pop`). Slimmed and kept.
- `../forks/python-packages/glueco-plugin-llm` — Python plugin client. Deleted (superseded; apps use plain HTTP or the OpenAI client).

### Current Prisma models

`App` (status enum PENDING/ACTIVE/SUSPENDED/REVOKED), `AppCredential` (Ed25519 public keys, ACTIVE/REVOKED, supports rotation), `ConnectCode` (hashed pairing codes, 10-min TTL, single-use), `InstallSession` (approval flow state, requestedPermissions Json, redirectUri), `ResourceSecret` (per-provider API keys, envelope-encrypted `encryptedKey`+`keyIv`, `resourceId` string like `"llm:groq"`, config Json), `ResourcePermission` (appId + resourceId + action, validFrom/expiresAt/timeWindow, constraints Json, rate limits, burst, daily/monthly quotas, token budgets, status), `PermissionUsage` (per-period counters), `AppLimit`, `RequestLog` (decision enum, latency, metadata Json).

**Important property to preserve:** `resourceId` is a free-form string (`"<resourceType>:<provider>"`), not a foreign key. The permission model is already connector-agnostic. Do not change this format.

### Current request pipeline (`server/gateway/pipeline.ts`)

Auth (PoP) → app status → permission lookup → rate limit (Redis) → budget (Redis) → plugin `validateAndShape` → policy enforcement → plugin `execute` → audit log. Streaming supported (SSE passthrough; Gemini plugin translates its stream to OpenAI chunk shape).

### Current PoP protocol (KEEP AS-IS, v1)

Headers: `x-pop-v: 1`, `x-app-id`, `x-ts` (unix), `x-nonce` (≥16 chars), `x-sig` (Ed25519 over canonical request: method + path-with-query + body hash + ts + nonce; see `packages/shared/src/pop.ts` `buildCanonicalRequestV1`). Nonce replay-check currently in Redis (`checkAndSetNonce`) — moves to Postgres (Part 6). Timestamp window validation in `lib/crypto.ts`. **The wire protocol does not change**; existing PoP clients keep working.

### Current environment variables

`DATABASE_URL`, `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Upstash — being removed), `GATEWAY_URL`, `ADMIN_SECRET`, vault master key (see `lib/vault.ts` for exact name), plus `DEMO_*` variants switched by `VERCEL_GIT_COMMIT_REF === "demo"` in `src/env.ts` (keep this mechanism, drop its KV entries).

### Known repo hygiene issues (fix in Phase 0)

- 369 files show mode-only changes (`100644` → `100755`) from a zip round-trip. No content changes.
- `apps/proxy/.next/`, `examples/demo-target-app/.next/`, `packages/*/dist/`, `*.tsbuildinfo`, and two `.env` files (`apps/proxy/.env`, `examples/demo-target-app/.env`) are committed to git.
- The `glueco/gateway` → `glueco/cookey` rename is half-done: `packages/*/package.json` say `cookey`, but `README.md`, `docs/ADMIN_GUIDE.md`, `docs/DEVELOPER_GUIDE.md` still reference `github.com/glueco/gateway` (including the Vercel deploy button URL).
- Exactly one test file exists in the entire repo (`schema-first-pipeline.test.ts`).

---

## Part 3 — Target Architecture Overview

### Concepts and glossary

| Term | What it is | Form | Who authors it |
|---|---|---|---|
| **Adapter** | Wire-protocol implementation (how to call an OpenAI-compatible API, Anthropic, Gemini, mail, generic HTTP) | TypeScript code, built into the gateway, ~5 total | Us, in this repo |
| **Connector** | A provider integration: "here is how to talk to Groq" — names an adapter + supplies config | Declarative JSON, stored frozen in DB | Marketplace repo, any URL, or the in-app builder |
| **Grant** | A contract between a target app and this gateway: "app X may use these resources, this long, this much" | Declarative JSON, stored frozen in DB after owner approval | App author (by hand, via hosted builder page, or programmatically) |
| **Grant token** | Static bearer credential minted at approval (`ck_…`) | Random secret; only SHA-256 hash stored | Gateway |
| **PoP credential** | Ed25519 keypair; app holds seed, gateway holds public key | Existing `AppCredential` model | App (generates locally) |
| **Template** | Owner-saved grant defaults ("Trusted app", "Cheap demo tier") applied at approval in one click | JSON, DB row | Owner |
| **Marketplace** | Curated index of connectors | Separate GitHub repo with `registry.json`, served raw | Us + community PRs |

### System diagram

```
 App author                     Gateway owner                        Providers
 ──────────                     ─────────────                        ─────────
 writes grant.json  ──────►  reviews on approval screen
 (or uses builder page)      binds llm:* → installed connectors
                             picks auth (bearer/PoP), duration,
                             template; sees spend projection
                                     │ approve
                                     ▼
                             mints ck_ token ─── claim code / copy-paste ──► app
                                     │
 app calls /r/llm/groq/... ─► pipeline: auth → grant checks → limits
 (bearer or PoP)                → adapter(connector.config) ────────────► api.groq.com
                                → usage recorded, budgets decremented
                                → RequestLog

 Marketplace repo ──registry.json──► admin UI: browse / install / update (frozen JSON in DB)
 Any URL          ──connector.json─► install-by-URL with security review screen
 In-app builder   ──────────────────► custom connector (http-passthrough or any adapter)
```

### What stays the same (do not rewrite)

- Next.js App Router gateway app at `apps/proxy/`; Prisma + Postgres; Vercel-first deployment.
- PoP wire protocol v1 (headers, canonical signing) and `AppCredential` key rotation.
- Envelope encryption of provider secrets in `lib/vault.ts`.
- Admin auth (cookie session + `ADMIN_SECRET` bearer fallback).
- Data-plane URL shape `/r/[resourceType]/[provider]/[...path]` including the OpenAI-compat `v1/…` path aliasing, so `baseURL`-style clients keep working.
- The `resourceId` string format `"<type>:<provider>"` everywhere.
- The demo-branch env-switching mechanism in `src/env.ts` (minus the KV entries).

---

## Part 4 — The Connector Specification

### 4.1 Document format (specVersion 1)

A connector is a single JSON document. Full annotated example (this exact document, minus comments, becomes the built-in Groq seed):

```jsonc
{
  "specVersion": "1",              // REQUIRED. Gateway rejects unknown majors at install.
  "id": "llm:groq",                // REQUIRED. "<resourceType>:<provider>". Regex: ^[a-z]+:[a-z0-9-]+$
  "name": "Groq",                  // REQUIRED. Display name.
  "version": "1.0.0",              // REQUIRED. Semver of THIS document (drives update diffs).
  "description": "Fast LLM inference (Llama, Mixtral) via Groq.",
  "homepage": "https://groq.com",
  "resourceType": "llm",           // REQUIRED. Derived category ("llm", "mail", "http", ...).
  "adapter": "openai-compatible",  // REQUIRED. Must be one of the built-in adapter ids (4.2).

  "config": {                      // Adapter-specific config. Validated by the adapter's zod schema.
    "baseUrl": "https://api.groq.com/openai/v1",
    "auth": { "type": "bearer" }   // bearer | header {name} | query {name}
  },

  "allowedHosts": ["api.groq.com"],// REQUIRED. Egress pin. Requests may ONLY go to these hosts.
                                   // If omitted at authoring time, derived from config.baseUrl at
                                   // install and frozen. baseUrl host MUST be in this list.

  "actions": {                     // REQUIRED, ≥1. Key = action id (dot-separated).
    "chat.completions": {
      "method": "POST",
      "path": "/chat/completions", // Appended to baseUrl by the adapter.
      "streaming": true,           // Whether SSE streaming is supported for this action.
      "enforce": {                 // Declarative constraint map — replaces validateAndShape().
                                   // Key = JSON pointer-ish field in the request body.
                                   // Value = named enforcement rule bound to permission constraints.
        "model":      { "rule": "allowedValues", "constraint": "allowedModels" },
        "max_tokens": { "rule": "clampMax", "constraint": "maxOutputTokens", "default": 4096 },
        "stream":     { "rule": "allowFlag",  "constraint": "allowStreaming" }
      },
      "usage": {                   // Response-field paths — replaces extractUsage().
        "inputTokens":  "usage.prompt_tokens",
        "outputTokens": "usage.completion_tokens",
        "totalTokens":  "usage.total_tokens",
        "model":        "model"
      }
    },
    "models.list": { "method": "GET", "path": "/models", "streaming": false }
  },

  "models": [                      // Default model catalog (UI pickers, /v1/grant resolution).
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant"
  ],

  "pricing": {                     // OPTIONAL. Per-model USD per 1M tokens. Drives spend projection.
    "llama-3.3-70b-versatile": { "inputPerMTok": 0.59, "outputPerMTok": 0.79 }
  },

  "credentials": [                 // Drives the credential form in admin UI (existing CredentialField shape).
    { "name": "apiKey", "type": "secret", "label": "Groq API key", "required": true },
    { "name": "baseUrl", "type": "url", "label": "API base URL", "required": false }
  ],

  "errorMap": {                    // Replaces mapError(). Keys: HTTP status as string, or
                                   // provider error-code string found at errorCodePath.
    "401": "PROVIDER_AUTH_FAILED",
    "429": "RATE_LIMITED",
    "insufficient_quota": "QUOTA_EXCEEDED"
  },
  "errorCodePath": "error.code"    // Where to find provider error codes in error bodies.
}
```

Validation rules (enforce at install time with a zod schema in `apps/proxy/src/server/connectors/schema.ts`):

- `specVersion` major must be `1`. Store the raw string.
- `id` unique per gateway; format-validated. `resourceType` must equal the prefix of `id`.
- `adapter` must exist in the adapter registry; `config` must pass that adapter's own zod schema.
- Every host in `allowedHosts` must be a bare hostname (no scheme/port/path). `config.baseUrl`'s host must be present in `allowedHosts`.
- Enforcement `rule` values must be from the fixed rule set (4.3). Unknown rules → install rejected.
- Reject documents > 64 KB.

### 4.2 Adapters (built-in code)

Location: `apps/proxy/src/server/adapters/`. One module per adapter + `index.ts` registry keyed by id. Each adapter implements:

```ts
// apps/proxy/src/server/adapters/types.ts
export interface AdapterContext {
  secret: string;                          // resolved decrypted credential (apiKey)
  credentials: Record<string, string>;     // all resolved credential fields
  config: Record<string, unknown>;         // connector.config (frozen)
  connector: ConnectorDocument;            // full frozen document (for models, errorMap, ...)
}

export interface Adapter {
  id: string;                              // "openai-compatible", ...
  configSchema: ZodSchema;                 // validates connector.config at install
  /** Shape/translate the (already-enforced) input into the provider wire format. */
  buildRequest(action: ActionSpec, input: unknown, ctx: AdapterContext, opts: { stream: boolean }): {
    url: string; method: string; headers: Record<string, string>; body?: BodyInit;
  };
  /** Translate the provider response back to the gateway-canonical shape (OpenAI-style for llm). */
  parseResponse(action: ActionSpec, response: Response, opts: { stream: boolean }): Promise<AdapterResult>;
  // AdapterResult = { response?: unknown; stream?: ReadableStream<Uint8Array>; contentType: string }
}
```

Enforcement, usage extraction, and error mapping are **NOT** adapter methods — they are generic engine code driven by the connector document (4.3), so they work identically for every adapter. Adapters only do wire-format translation.

The five adapters, ported from the existing plugin `proxy.ts` files (which are the reference implementations — port their logic, then delete the packages):

1. **`openai-compatible`** — from `plugin-llm-groq`/`plugin-llm-openai`. Bearer/header auth, JSON POST to `baseUrl + path`, body passthrough, SSE stream passthrough. Config: `baseUrl`, `auth`, optional `extraHeaders` (e.g. OpenAI `OpenAI-Organization` from a credential field). Covers Groq, OpenAI, and the entire OpenAI-compatible long tail (OpenRouter, DeepSeek, Together, Fireworks, Mistral, Ollama, vLLM…) as pure-data connectors.
2. **`anthropic-messages`** — from `plugin-llm-anthropic`. Translates OpenAI-style chat body → Anthropic `/v1/messages` (system-message extraction, `x-api-key` + `anthropic-version` headers) and translates responses AND SSE stream chunks back to OpenAI shape, exactly as the current plugin does. Config: `baseUrl`, `anthropicVersion`.
3. **`gemini-generative`** — from `plugin-llm-gemini`. `messages` → `contents`/`parts` + `systemInstruction`; auth via `?key=` query param; paths `/{model}:generateContent` and `/{model}:streamGenerateContent?alt=sse`; response + stream chunks converted to OpenAI shape, as the current plugin does. Config: `baseUrl`.
4. **`mail-send`** — from `plugin-mail-resend`. JSON POST send-email shape; enforcement rules for from/to domains, recipient counts, html/attachments flags map through the generic engine. Config: `baseUrl`, `auth`.
5. **`http-passthrough`** — NEW (modeled on KeyControl's gateway). Generic REST forwarder: injects the credential (bearer header / named header / query param), restricts requests to `allowedHosts` + a per-action `method` + `pathPattern` allowlist (glob patterns like `/v1/images/*`), forwards body bytes untouched, streams responses. **No body-level enforcement** (no model allowlists / token budgets — request-count limits and quotas still apply). This is the escape hatch that lets the custom builder wrap ANY REST API without us writing code. Actions for this adapter use `pathPattern` instead of `path`, and requests supply their own sub-path.

Canonical shape note: for `resourceType: "llm"`, the gateway-canonical request/response format is OpenAI chat-completions (current behavior — Gemini/Anthropic plugins already translate both directions). Preserve this so any OpenAI SDK pointed at `/r/llm/<provider>` works regardless of provider.

### 4.3 Generic enforcement engine

Location: `apps/proxy/src/server/gateway/enforce.ts` (rewrite of existing file). Input: action's `enforce` map + the grant permission's `constraints` Json + the parsed request body. Fixed rule set for specVersion 1:

| Rule | Behavior |
|---|---|
| `allowedValues` | Body field must be in the constraint array (e.g. `model` ∈ `allowedModels`). Missing constraint → connector `models` list applies if the constraint key is `allowedModels`, else unrestricted. Violation → 403 `ERR_CONSTRAINT`. |
| `clampMax` | Body field is clamped down to the constraint value (or `default` if field absent). Never errors; silently caps. |
| `allowFlag` | If constraint is `false`, body field must be absent/false. Violation → 403. |
| `maxItems` | Array field length ≤ constraint (e.g. recipients ≤ `maxRecipients`). |
| `domainAllowlist` | Email-ish field's domain(s) must be in constraint array (e.g. `allowedFromDomains`). |
| `forbidField` | If constraint is `false`, the field must be absent (e.g. `attachments` when `allowAttachments: false`). |

Field addressing: dot paths into the JSON body (`"max_tokens"`, `"to"`, `"messages"`). Arrays of scalars are checked element-wise for `domainAllowlist`.

Behavior contract (same invariants as today's schema-first pipeline): body is parsed once; if enforcement fails the upstream is never called; enforcement cannot be bypassed by malformed payloads (unparseable JSON on an action with any `enforce` entries → 400).

### 4.4 Connector lifecycle

**Sources:** `BUILTIN` (seeded), `REGISTRY` (marketplace), `URL` (arbitrary), `CUSTOM` (in-app builder). Stored on the row; drives trust badges in UI.

**Install flow (URL and REGISTRY):**
1. Admin submits a URL (or clicks Install in marketplace → same path with the registry's raw URL).
2. Server fetches the JSON **through the SSRF guard** (Part 8). 5s timeout, 64 KB cap, no redirects to private ranges.
3. Document validated against the connector zod schema. Failures shown verbatim to admin.
4. **Review screen** rendered (Part 9.4). The top of the screen, in this order: (a) egress hosts (`allowedHosts`) with the sentence *"Your ___ credential will be sent to these hosts"*; (b) trust badge (Official registry / Unverified URL / Custom); (c) credentials it will ask for; (d) actions + enforcement summary; (e) models + pricing if present.
5. On confirm: the **exact fetched JSON** is frozen into the DB row. The gateway NEVER re-fetches a connector at request time. Ever.
6. Admin is prompted to enter credentials (creates/updates the `ResourceSecret` row for that `resourceId`).

**Update flow:** manual "Check for updates" button (and a daily cron check for REGISTRY/URL connectors that only *records* availability — never auto-applies). If the source now serves a higher `version`: show a structured diff (hosts added/removed highlighted in red, credential changes, enforcement changes, model/pricing changes), require explicit re-approval, then replace the frozen JSON. Host additions get the same warning treatment as a fresh install.

**Enable/disable:** boolean on the row; disabled connectors 404 on the data plane and disappear from `/api/resources` but keep their credentials.

**Remove:** blocked while any ACTIVE grant has permissions bound to its `resourceId` (show which); otherwise deletes row (credentials optionally kept).

**Built-in seeds:** on boot (and via a "Restore built-ins" button), upsert the five connector documents (groq, openai, gemini, anthropic, resend) from `apps/proxy/src/server/connectors/builtin/*.json` — these are the direct ports of the five plugin packages, and MUST reproduce their current behavior: OpenAI's `insufficient_quota` error mapping and optional `organization` credential; Gemini/Anthropic translation via their adapters; each plugin's default models and default `maxOutputTokens` (groq 4096, openai 16384 — read each plugin's `proxy.ts` before porting). Upsert must not overwrite an admin-modified copy (compare version; skip if local differs).

**Runtime registry:** `apps/proxy/src/server/connectors/registry.ts` replaces `server/plugins/*`. Loads enabled connectors from DB with an in-memory cache (60s TTL + explicit invalidation on admin mutations). Pipeline resolves `resourceId → { connectorDoc, adapter }` from here.

---

## Part 5 — The Grant Specification

### 5.1 Document format (specVersion 1)

Authored by the app developer. Full annotated example:

```jsonc
{
  "specVersion": "1",
  "app": {                          // REQUIRED. Shown verbatim on the approval screen.
    "name": "Outsmart",
    "description": "LLM social-deduction game — models negotiate and vote each round.",
    "homepage": "https://outsmart.example.app",
    "iconUrl": "https://outsmart.example.app/icon.png"   // optional; proxied/sandboxed in UI
  },
  "runtime": "server",              // REQUIRED. "server" | "serverless" | "cli" | "browser".
                                    // Policy anchor, not a promise (enables IP pinning offers,
                                    // makes violations visible). "browser" requests are flagged
                                    // with a strong warning and force allowBrowser handling.
  "auth": "bearer",                 // Requested auth: "bearer" | "pop". Owner may override at approval.
  "publicKey": null,                // REQUIRED iff auth == "pop": base64 Ed25519 public key.

  "requests": [                     // REQUIRED, ≥1. What the app wants and why.
    {
      "resource": "llm:*",          // Concrete id ("llm:groq") OR capability wildcard ("llm:*").
      "actions": ["chat.completions"],
      "reason": "Runs the four AI players each game round.",   // REQUIRED. Owner sees this.
      "constraints": {              // Requested ceilings — owner can only tighten, never loosen.
        "maxOutputTokens": 1024,
        "allowStreaming": false
      }
    },
    {
      "resource": "mail:resend",
      "actions": ["send"],
      "reason": "Emails the game summary to the player.",
      "constraints": { "maxRecipients": 1 }
    }
  ],

  "duration": "30d",                // Requested TTL. Reuse packages/shared duration-presets values.
  "renewal": { "period": "30d" },   // OPTIONAL. Requests a renewable grant (owner re-confirms each period).
  "budget": {                       // Requested ceilings; owner can tighten.
    "dailyRequests": 200,
    "dailyTokens": 100000
  },
  "redirectUri": "https://outsmart.example.app/callback"  // OPTIONAL. Enables claim-code delivery.
}
```

Validation: zod schema in `apps/proxy/src/server/grants/schema.ts`. `reason` required and ≤ 300 chars per request. Reject > 32 KB. Wildcard only in the form `<type>:*`.

### 5.2 How a grant reaches the gateway (three paths, all landing in the same review flow)

1. **Well-known discovery (preferred):** the app hosts `/.well-known/cookey-grant.json`. Owner pastes the app's URL into "Add app" in the dashboard; gateway fetches it (same SSRF guard), renders the review screen. Re-fetching later powers "this app now also requests…" update diffs (same mechanism as connector updates).
2. **App-initiated (current connect flow, upgraded):** app POSTs the grant document to `/api/connect/prepare` with a pairing code (existing `ConnectCode` mechanism, kept as-is: admin generates, 10-min TTL, single-use, hash-stored). Creates a PENDING grant + approval URL; app polls `/api/connect/status` (existing shape).
3. **Manual paste:** owner pastes raw grant JSON into the dashboard. Same review screen.

### 5.3 Approval — what the owner decides

The approval screen (full UI spec in 9.3) collects these decisions, which together produce the ACTIVE grant:

- **Wildcard binding:** each `<type>:*` request is bound to one or more concrete installed connectors of that type (checkbox list; default all enabled connectors of the type). This materializes into per-connector `ResourcePermission` rows, so the pipeline's permission lookup shape is unchanged. This binding step is REQUIRED for the wildcard feature — target apps cannot know which connectors a given gateway has installed.
- **Auth confirmation:** accept requested auth or override. **Warning matrix (exact behavior):**
  - bearer + effective duration ≤ 7d → no warning.
  - bearer + duration > 7d, non-renewable → **red warning**: *"A leaked token is silently usable until {date}. For long-lived access, PoP keeps the credential out of every request and log. Continue with a static token?"* Owner may proceed.
  - bearer + renewable (period ≤ 31d) → yellow note only.
  - pop → no warning at any duration (requires `publicKey` present; else the pop option is disabled with an explanation).
- **Duration & renewal:** accept/modify requested duration; toggle renewable + period.
- **Limits:** the requested `constraints`/`budget` are prefilled as ceilings; owner can tighten any value, never loosen beyond the request (loosening is allowed with an explicit "exceeds what the app asked for" note — owner's gateway, owner's call, but make it deliberate).
- **Template:** dropdown applying a saved `GrantTemplate`'s values over the form (Part 5.6).
- **Hardening options:** egress IP allowlist (offered prominently when `runtime` is `server`); `allowBrowser` (default false, warning if enabled); `inactivitySuspendDays` (default from Settings, e.g. 14; 0 = off).
- **Spend projection** (display only, Part 5.7).

On approve: freeze the submitted document + a `decisions` JSON (bindings, overrides) on the Grant row; create `ResourcePermission` rows; mint credential (5.4); fire redirect/claim or show copy-paste screen.

### 5.4 Credentials: bearer tokens and PoP

**Bearer (`GrantToken`):**
- Format: `ck_` + 40 chars base62 from CSPRNG (`crypto.randomBytes`). Display prefix = first 12 chars, stored plaintext for identification; the full token is stored **only** as SHA-256. Shown to a human exactly once.
- Presented as `Authorization: Bearer ck_…` on data-plane requests. Auth resolution order in the pipeline: `Bearer ck_` prefix → GrantToken path; `x-sig` header present → PoP path; both → 400; neither → 401.
- Expiry: `min(grant expiry, current renewal period end)`. Renewal extends the SAME token's expiry (no reissue — apps hold read-only config).
- Revocation: owner revokes token or grant → immediate 401. Track `lastUsedAt`, `lastUsedIp` (update at most once/min per token to avoid write amplification).
- Register the `ck_` pattern with GitHub secret scanning (partner program) — Phase 4 task; until then it's still greppable.

**Delivery paths (both required):**
- *Claim-code redirect* (hosted apps): on approval, mint single-use claim code (10-min TTL, hash-stored, `ClaimCode` row), redirect to `redirectUri?code=…&gateway=…`; app exchanges via `POST /v1/token/claim { code }` → `{ token, grantId, expiresAt }`. Claim codes are single-use; second exchange attempt 410s and notifies the owner.
- *Copy-paste* (CLI/Streamlit/anything): approval success screen and the grant detail page (until first data-plane use) show the token with a copy button and per-language snippets. After first use, the token is never displayable again — only revoke/regenerate (regenerate = revoke old + mint new, same grant).

**PoP:** unchanged protocol. The grant's `publicKey` creates the `AppCredential` row. Key rotation continues via existing `/api/connect/rotate`. Slim SDKs (Part 10) cover TS + Python.

### 5.5 Grant lifecycle

States: `PENDING` → `ACTIVE` → (`SUSPENDED_INACTIVITY` | `SUSPENDED_ANOMALY` | `SUSPENDED_MANUAL`) ⇄ `ACTIVE`; terminal: `EXPIRED`, `REVOKED`, `DENIED`. Data-plane requests against any non-ACTIVE grant → 403 with a state-specific error code.

- **Expiry:** cron sweep marks past-due grants EXPIRED (and their permissions, preserving existing expiry semantics).
- **Renewal:** renewable grants get `currentPeriodEnd`. Cron: 3 days before period end → owner notification *"Outsmart's access expires in 3 days — renew?"* with one-click renew (extends period + token expiry). Not renewed → EXPIRED at period end. This is the primary containment for long-lived bearer grants: the ceiling on a stolen credential is the current period, and abandoned grants die by default.
- **Inactivity suspend:** if `inactivitySuspendDays > 0` and no data-plane request for that many days → SUSPENDED_INACTIVITY + notification. One-click reactivate. (Note in code comments: this catches dormant grants pre-theft; an active thief keeps a grant warm — detection for that case is digests + last-IP visibility.)
- **Revoke:** owner action, immediate, terminal.

### 5.6 Grant templates (owner presets)

`GrantTemplate { id, name, description, values Json }` where `values` holds any subset of approval-screen decisions (duration, renewal, auth, budget ceilings, constraint tightenings, inactivitySuspendDays, allowBrowser). Applying a template overwrites the form; fields remain editable after. CRUD in Settings → Templates + "Save current as template" on the approval screen. Ship two starter templates on seed: "Trusted app" (30d renewable, generous), "Demo / cheap tier" (7d, static, tight budgets).

### 5.7 Spend projection

At approval, for each bound LLM connector with `pricing`: worst-case/day = `dailyTokens × max over allowed models of (outputPerMTok)/1M` (use output rate as the conservative bound; if only `dailyRequests` is set, worst-case/day = `dailyRequests × maxOutputTokens × rate/1M`). Display: *"Worst case ≈ $X.XX/day (≈ $Y/month) on your Groq key"* summed across bindings, with per-connector breakdown on hover/expand. No pricing on a connector → show "no pricing data" for that row, never guess. Show "$0 possible? verify caps" hint when no budget fields were set at all (i.e., unlimited — make the absence loud).

### 5.8 App-facing runtime endpoint

`GET /v1/grant` (authed by bearer token or PoP) returns what the app actually got — this replaces per-provider guesswork and powers model pickers:

```json
{
  "grantId": "…", "status": "ACTIVE",
  "expiresAt": "…", "currentPeriodEnd": "…", "auth": "bearer",
  "resources": [
    { "resourceId": "llm:groq", "actions": ["chat.completions"],
      "models": ["llama-3.3-70b-versatile"],
      "constraints": { "maxOutputTokens": 1024, "allowStreaming": false },
      "remaining": { "dailyRequests": 143, "dailyTokens": 61230 } }
  ]
}
```

`models` = connector models ∩ permission `allowedModels` (if set). Keep the existing public `GET /api/resources` discovery endpoint, now generated from enabled connectors.

---

## Part 6 — Database Changes (Prisma)

Migrations must be additive-first (create new tables, backfill, then drop old columns in a later migration within the same phase). Exact models to add:

```prisma
model Connector {
  id           String   @id @default(cuid())
  connectorId  String   @unique            // "llm:groq" — matches resourceId format
  resourceType String
  version      String                      // semver from the document
  source       ConnectorSource             // BUILTIN | REGISTRY | URL | CUSTOM
  sourceUrl    String?                     // fetch origin for REGISTRY/URL
  document     Json                        // the FROZEN connector JSON
  enabled      Boolean  @default(true)
  updateAvailable Json?                    // {version, fetchedAt} recorded by cron, never auto-applied
  installedAt  DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([resourceType, enabled])
}
enum ConnectorSource { BUILTIN REGISTRY URL CUSTOM }

model Grant {
  id            String      @id @default(cuid())
  appId         String      @unique        // 1:1 with existing App (identity + PoP credentials)
  app           App         @relation(fields: [appId], references: [id], onDelete: Cascade)
  document      Json                        // FROZEN grant JSON as submitted
  decisions     Json?                       // owner's approval decisions (bindings, overrides)
  status        GrantStatus @default(PENDING)
  authType      GrantAuth                   // BEARER | POP
  runtime       String                      // "server" | "serverless" | "cli" | "browser"
  sourceUrl     String?                     // well-known URL if discovered that way
  expiresAt     DateTime?
  renewalPeriodDays    Int?
  currentPeriodEnd     DateTime?
  inactivitySuspendDays Int?
  allowBrowser  Boolean  @default(false)
  egressIps     String?                     // newline/comma list, KeyControl-style patterns (exact, wildcard, CIDR)
  lastUsedAt    DateTime?
  lastUsedIp    String?
  approvedAt    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  tokens        GrantToken[]
  claimCodes    ClaimCode[]
  @@index([status, expiresAt])
  @@index([status, currentPeriodEnd])
}
enum GrantStatus { PENDING ACTIVE SUSPENDED_INACTIVITY SUSPENDED_ANOMALY SUSPENDED_MANUAL EXPIRED REVOKED DENIED }
enum GrantAuth { BEARER POP }

model GrantToken {
  id           String    @id @default(cuid())
  grantId      String
  grant        Grant     @relation(fields: [grantId], references: [id], onDelete: Cascade)
  tokenHash    String    @unique            // SHA-256 hex of full token
  displayPrefix String                      // "ck_a1B2c3d4e" — first 12 chars, for UI identification
  expiresAt    DateTime
  revokedAt    DateTime?
  firstUsedAt  DateTime?                    // gates the "still displayable" copy-paste window
  lastUsedAt   DateTime?
  lastUsedIp   String?
  createdAt    DateTime  @default(now())
  @@index([grantId])
}

model ClaimCode {
  id        String    @id @default(cuid())
  codeHash  String    @unique
  grantId   String
  grant     Grant     @relation(fields: [grantId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  @@index([expiresAt])
}

model PopNonce {                             // replaces Redis checkAndSetNonce
  nonce     String   @id                     // insert-or-conflict = replay detected
  expiresAt DateTime
  @@index([expiresAt])                       // cron cleanup
}

model RateCounter {                          // replaces Redis fixed-window rate limiting
  key         String                         // e.g. "rl:{grantId}:{resourceId}:{action}"
  windowStart DateTime                       // floored to window
  count       Int      @default(0)
  @@id([key, windowStart])
}

model GrantTemplate {
  id          String  @id @default(cuid())
  name        String  @unique
  description String?
  values      Json
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Notification {
  id        String    @id @default(cuid())
  type      String                            // "renewal_due" | "inactivity_suspend" | "claim_reuse" |
                                              // "digest" | "connector_update" | "anomaly"
  title     String
  body      String
  payload   Json?
  readAt    DateTime?
  createdAt DateTime  @default(now())
  @@index([readAt, createdAt])
}
```

Modifications to existing models:

- `App`: add `grant Grant?` relation. Keep everything else (credentials, status) — App remains the identity anchor for PoP.
- `ResourcePermission`: add optional `grantId String?` + relation + index. New permissions always set it. Keep `appId` (backfill: existing permissions' apps get a synthesized ACTIVE Grant row with `document: {legacy: true, ...reconstructed}` so old PoP apps keep working — write this backfill in the migration).
- `RequestLog`: add `grantId String?`, `connectorId String?` (the resourceId served), `costEstimate Float?` (computed from pricing when available).
- `InstallSession`: superseded by `Grant(status: PENDING)` + `decisions`. Migrate: create PENDING grants from open sessions, then drop the model in the cleanup migration.
- `AppLimit`: absorbed by grant-level budget in `decisions` + permissions. Drop in cleanup migration after backfill.
- Budget/usage counters: **keep and reuse `PermissionUsage`** (daily/monthly request + token counters) but move increment logic from Redis to Postgres: atomic `INSERT … ON CONFLICT DO UPDATE SET count = count + $n RETURNING`, then compare against the cap; over-cap → deny + decrement is NOT needed if you check-before-increment with the returned value (deny when returned value > cap and the request was not forwarded — increment only after upstream success for token counts; request counts increment at admission, matching current Redis semantics — read `lib/redis.ts` checkAndIncrementBudget for the exact current semantics and preserve them).

Redis removal checklist: delete `lib/redis.ts`; nonces → `PopNonce`; `checkRateLimit`/`checkModelRateLimit` → `RateCounter` upserts; budgets → `PermissionUsage` as above; `recordModelUsage`/stats → SQL aggregations over `RequestLog` (dashboard queries). Remove `KV_REST_API_URL`/`KV_REST_API_TOKEN` (and `DEMO_` variants) from `env.ts`, `.env.example`, and all docs. Add `CRON_SECRET` env var (Vercel cron auth).

---

## Part 7 — Backend: Routes and Pipeline

### 7.1 Endpoint inventory (target state)

**Data plane (app-facing):**
| Route | Change |
|---|---|
| `POST/GET /r/[resourceType]/[provider]/[...path]` | Keep shape incl. `v1/` aliasing. Auth now bearer OR PoP. Resolves connector from registry instead of plugin. For `http-passthrough` connectors the remaining path is matched against action `pathPattern`s. |
| `GET /api/resources` | Keep. Now generated from enabled connectors. |
| `POST /api/connect/prepare` | Upgraded: accepts grant document (5.1) + pairing code. Keep legacy flat-format normalization for old SDK clients (mark deprecated). Creates PENDING Grant. |
| `GET /api/connect/status` | Keep shape; reads Grant status. |
| `POST /api/connect/rotate` | Keep (PoP key rotation). |
| `GET /api/app/status` | Keep; now includes grant state. |
| `POST /v1/token/claim` | NEW. `{ code }` → `{ token, grantId, expiresAt }`. Single-use; reuse → 410 + owner Notification("claim_reuse"). Rate-limit by IP (RateCounter). |
| `GET /v1/grant` | NEW (5.8). |

**Admin (all behind `checkAdminAuth`):**
| Route | Purpose |
|---|---|
| `GET/POST /api/admin/connectors` | List; install (body: `{url}` or `{document}` for CUSTOM). POST returns a preview payload first when `{url, preview: true}` — two-step: preview then confirm-install with the previewed document echoed back (server re-validates equality). |
| `PATCH/DELETE /api/admin/connectors/[id]` | Enable/disable, apply update, remove (blocked while ACTIVE grants bound). |
| `GET /api/admin/connectors/marketplace` | Server-side fetch of the registry index (SSRF-guarded, cached 10 min). |
| `GET/POST/PATCH /api/admin/grants`, `/api/admin/grants/[id]` | List/detail; approve (with decisions payload), deny, revoke, renew, suspend/reactivate, regenerate token. Absorbs `/api/admin/apps` + `/api/connect/approve`'s admin half. |
| `POST /api/admin/grants/fetch` | NEW. `{appUrl}` → fetch `/.well-known/cookey-grant.json` (SSRF-guarded) → create PENDING grant. |
| `GET/POST/PATCH/DELETE /api/admin/templates` | GrantTemplate CRUD. |
| `/api/admin/pairing/generate`, `/api/admin/resources` (credentials), `/api/admin/login`, `/api/admin/models` | Keep. `resources` credential forms are now driven by connector `credentials` field. `plugins` route: delete. |
| `GET /api/admin/notifications`, `PATCH …/[id]` | List / mark read. |
| `GET /api/admin/stats` | Dashboard aggregates (from RequestLog + PermissionUsage). |

**Cron (Vercel crons in `vercel.json`, authed by `Authorization: Bearer ${CRON_SECRET}`):**
| Route | Schedule | Work |
|---|---|---|
| `POST /api/cron/sweep` | hourly | Expire grants/permissions past due; expire renewal periods; suspend inactive grants; delete expired PopNonce, ClaimCode, ConnectCode rows; delete RateCounter windows older than 2×window; enqueue renewal-due notifications (T-3 days). Replaces the existing `remove-expired` route (delete it). |
| `POST /api/cron/digest` | weekly | Per-gateway usage digest Notification (+ email if a mail connector with credentials is configured in Settings → Notifications): per-grant requests, tokens, est. cost, last-active, last IP. |
| `POST /api/cron/connector-updates` | daily | For REGISTRY/URL connectors, fetch source version; record `updateAvailable`; Notification on new. |

### 7.2 Pipeline rewrite (`server/gateway/pipeline.ts`)

Stage order (preserve current invariants — single body parse, no upstream call on any denial, full audit):

1. **Auth resolve:** `Bearer ck_…` → hash lookup in GrantToken (check revoked/expired, update lastUsed throttled) → grant. `x-sig` present → existing PoP verification (nonce via `PopNonce` insert-conflict) → app → grant. Result: `{ grant, authType }`.
2. **Grant state:** must be ACTIVE (state-specific error codes for suspended/expired/revoked).
3. **Origin gate:** if request has `Origin` or `Sec-Fetch-Site: cross-site` headers (browser-originated) and `grant.allowBrowser` is false → 403 `ERR_BROWSER_BLOCKED`. Apply on `/r/*` and `/v1/grant`.
4. **Egress IP check:** if `grant.egressIps` set, client IP must match (reuse KeyControl's matcher semantics: exact, `192.168.*` wildcards, CIDR — implement in `lib/ip-match.ts` with unit tests).
5. **Permission lookup:** unchanged shape (`grantId + resourceId + action`, falling back to appId for legacy rows), incl. validFrom/expiresAt/timeWindow checks from `access-policy.ts` (keep that module).
6. **Rate limit:** RateCounter fixed-window (permission-level values, as today).
7. **Budget:** PermissionUsage atomic upsert (semantics preserved from redis.ts).
8. **Enforcement:** generic engine (4.3) using connector action `enforce` + permission constraints.
9. **Execute:** adapter `buildRequest` → **egress guard asserts URL host ∈ connector `allowedHosts`** (hard invariant, checked at the single choke point that makes outbound requests) → fetch → `parseResponse`.
10. **Usage extraction:** engine reads `usage` paths from the response (non-streaming; for streaming keep current behavior of the plugins being ported — Gemini/Anthropic adapters surface usage where the current plugins do).
11. **Error mapping:** connector `errorMap` (status- and code-keyed) → canonical error codes; unmapped → generic upstream error with status passthrough. Never leak upstream error bodies containing credential echoes — redact any occurrence of the resolved secret from logged/returned error text (port `redactKeyInText` idea from KeyControl).
12. **Audit:** RequestLog with grantId, connectorId, decision, latency, usage metadata, costEstimate.

### 7.3 Anomaly hooks (lightweight, Phase 4)

On data-plane auth success: if `lastUsedIp` changes for a token, record it; if a grant exceeds 3× its trailing-7-day daily average requests in a day (computed in the sweep cron, not inline), create Notification("anomaly"). No auto-suspend by default; add a Settings toggle "Auto-suspend on anomaly" (default off).

---

## Part 8 — Security Requirements (hard checklist)

Every item here is a MUST unless marked optional.

1. **SSRF guard** (`lib/safe-fetch.ts`): used for ALL server-side fetches of admin-supplied URLs (connector install, marketplace index, well-known grant, connector update checks). Resolve DNS and reject: loopback, RFC1918, link-local (169.254.0.0/16 incl. metadata IPs), unique-local/v6 equivalents. Re-validate on every redirect hop (max 3). Timeout 5s. Size cap 64 KB. `https:` only (allow `http://localhost` ONLY when `NODE_ENV=development`).
2. **Egress pinning:** outbound provider requests may only target hosts in the connector's frozen `allowedHosts`. Asserted at the single execute choke point. A connector update that adds hosts requires explicit re-approval with red highlighting.
3. **Frozen documents:** connectors and grants execute ONLY from the DB-frozen JSON. No request-time fetching of any external document, ever.
4. **Spec versioning:** both document types carry `specVersion`; unknown majors rejected at install/submit with a clear message.
5. **Token hygiene:** SHA-256 at rest; constant-time hash comparison not required (hash lookup is by exact hash — timing-safe by construction); `ck_` prefix; shown once (plus the pre-first-use copy-paste window); never logged — add a logger redaction test asserting `ck_` never appears in log output.
6. **Browser blocking:** Origin gate per 7.2 step 3, default deny.
7. **Nonce replay:** PopNonce unique-insert; TTL = the PoP timestamp window ×2; cron cleanup.
8. **Secrets:** provider keys remain envelope-encrypted (existing vault.ts); decrypt only inside execute; redact from error bodies and logs. Committed `.env` files removed from git history-forward (Phase 0 removes from index; do not attempt history rewrite).
9. **Claim codes / pairing codes:** hash-stored, single-use, short TTL (10 min), IP rate-limited endpoints, reuse notifications.
10. **Admin surface:** all new admin routes behind `checkAdminAuth`; connector install/custom-builder is admin-only; CSRF posture unchanged from existing admin routes.
11. **Icon URLs** (`app.iconUrl`, connector icons): render via `<img>` with no referrer, never fetched server-side, CSP-constrained; broken/missing → identicon fallback. (Optional: proxy through an image sanitizer later.)
12. **Grant review integrity:** the confirm-install step re-validates that the document being installed byte-equals the previewed document (no TOCTOU between preview and install).

---

## Part 9 — Frontend Changes

Stack stays Next.js App Router + Tailwind. Add: **shadcn/ui** primitives (as in KeyControl — copy the component approach, not the code), **TanStack Query** for data fetching, a typed API client (`src/lib/api-client.ts`) wrapping all admin endpoints. All new UI must be built theme-aware from the start (CSS variables; light/dark toggle), but visual polish (color system, typography pass, landing page) is Phase 4 — structure now, beauty later.

### 9.1 Route restructure (admin)

Replace the 2,375-line `dashboard/page.tsx` monolith with a sidebar layout group:

```
app/(admin)/layout.tsx        # sidebar: Overview, Grants, Connectors, Marketplace,
                              #          Logs, Templates, Settings; ThemeToggle; notifications bell
                              # (provider credentials are managed inside each connector's detail page)
app/(admin)/overview/         # stat tiles (requests today, est. spend, active grants, top apps),
                              # recent activity, pending grants call-to-action
app/(admin)/grants/           # table: app, status chip, auth type, expiry/period, last used (+IP), est. cost
app/(admin)/grants/[id]/      # detail: frozen document viewer, decisions, per-resource usage bars,
                              # token panel (prefix, last used, revoke/regenerate, copy-paste window pre-first-use),
                              # actions: renew, suspend/reactivate, revoke; audit tail
app/(admin)/grants/new/       # "Add app": URL fetch (well-known) | paste JSON | pairing-code instructions
app/(admin)/connectors/       # cards: icon, name, version, source badge, enabled toggle, credential status,
                              # update-available pill
app/(admin)/connectors/[id]/  # frozen doc viewer, credential form (from `credentials` field → vault),
                              # models list, update-check + diff modal, remove
app/(admin)/connectors/new/   # custom builder (9.5)
app/(admin)/marketplace/      # grid from registry (9.6)
app/(admin)/logs/             # RequestLog table with filters (grant, connector, decision, date), detail drawer
app/(admin)/templates/        # GrantTemplate CRUD
app/(admin)/settings/         # gateway name/URL, admin password, notification config (mail connector picker,
                              # digest on/off), defaults (inactivitySuspendDays, warning thresholds), danger zone
```

Migration note: keep old `/dashboard` as a redirect to `/overview`. Extract data-fetching into `src/hooks/use*.ts` per resource (mirror KeyControl's `hooks/useApiKeys.ts` pattern). No page file may exceed ~400 lines; extract components into `src/components/<domain>/`.

### 9.2 The shared document renderer (build this FIRST — everything else reuses it)

`src/components/document/` — a schema-driven renderer for the two document types with three modes:

- **`edit`** — form generation (used by: custom connector builder, grant builder page, approval overrides).
- **`review`** — read-only, warning-decorated rendering (used by: connector install review, grant approval, update diffs).
- **`diff`** — side-by-side/inline structured diff of two documents (used by: connector updates, grant re-requests).

This single component family is the highest-leverage UI investment; do not build three bespoke forms.

### 9.3 Grant approval screen (rewrite of `connect/approve`)

Replaces `ApprovalForm` + the 1,151-line `AdvancedApprovalForm`. Layout top-to-bottom:

1. App identity card (name, description, homepage link with domain shown explicitly, icon).
2. Requests list — each with the app's `reason` quoted verbatim, the resource (wildcard shown as "Any LLM provider"), actions, requested constraints.
3. Wildcard binding checkboxes per wildcard request (default: all enabled connectors of that type; at least one required).
4. Template dropdown (applies over the form) + "Save as template".
5. Decision form: duration + renewable toggle/period, auth radio (with the exact warning matrix from 5.3 — red banner component for bearer-long), budgets/constraints (prefilled from request; tightening free, loosening requires an explicit confirmation checkbox), hardening accordion (egress IPs — surfaced non-collapsed when runtime=server; allowBrowser; inactivity days).
6. Spend projection panel (5.7).
7. Approve / Deny. On approve → claim-code redirect happens server-side, or token copy-paste screen with language snippets (curl, Python `openai` client with `base_url`, JS fetch, PoP SDK sample when applicable).

### 9.4 Connector install review screen

Rendered from the preview payload. Order is a product requirement, not a suggestion: **(1) egress hosts banner** — *"Your `{credential label}` will be sent to: `api.groq.com`"* — large, top; **(2) trust badge** (Official marketplace / ⚠ Unverified URL / Custom); **(3) credentials requested; (4) actions + what enforcement it supports; (5) models/pricing; (6) raw JSON expander.** Install button label: "Install and freeze this version".

### 9.5 Custom connector builder (`connectors/new`)

The KeyControl-style escape hatch. Form: name/id/type → adapter picker (with plain-language descriptions; `http-passthrough` described as "any REST API — forwards requests, no deep inspection") → adapter config fields → actions editor (method, path or pathPattern, streaming; enforcement rule rows for non-passthrough) → models/pricing (optional) → credentials fields → allowedHosts (auto-suggested from baseUrl, editable). Live JSON preview pane (document renderer in edit mode). "Test call" button: after saving credentials, fires a minimal request through the real pipeline against a selected action, shows result/error verbatim. Saves as `source: CUSTOM`.

### 9.6 Marketplace page

Grid of cards from the registry index (fetched via `/api/admin/connectors/marketplace`): icon, name, description, resourceType filter chips, search, installed/update-available states. Install → the exact 9.4 review flow. Footer link: "Install from URL instead" + "Build a custom connector".

### 9.7 Grant builder — public static page (`/builder`)

A public, unauthenticated, **purely client-side** route in the gateway app (also usable on the marketing/docs deployment since it has zero backend needs): form on the left (document renderer edit mode) → live outputs on the right: (a) the grant JSON, (b) a preview of what the owner's approval screen will show (renderer review mode — same component, that's the point), (c) copy-paste snippets: the `/.well-known/cookey-grant.json` file, bearer usage snippets per language, PoP SDK snippet when auth=pop. No data leaves the page.

### 9.8 Approval-screen-adjacent surfaces

- Notifications bell (header): unread Notification list, mark-read, deep links (renewal due → grant detail).
- Overview pending-grants banner when any PENDING grants exist.

---

## Part 10 — SDKs, Demo App, and the Marketplace Repo

### 10.1 TypeScript SDK (`packages/sdk`, `@glueco/sdk` → 1.0.0)

Slim to PoP-only + conveniences. Keep: keypair generation (`keys.ts`), canonical signing + `fetch` wrapper (`pop`/`fetch`/`transport`), connect helper (`connect.ts` — updated to submit grant documents), errors. Delete: anything importing plugin packages, `createTransport`'s plugin-client coupling. The SDK must have **zero runtime dependencies** and must not depend on `@glueco/shared` (vendor the ~100 lines of canonical-request code into the SDK; the gateway keeps its own copy — the wire protocol doc in `docs/` is the contract between them, with cross-language test vectors in `sdks/test-vectors.json` consumed by both test suites).
Bearer users need no SDK — document that loudly in the SDK README's first paragraph.

### 10.2 Python SDK

Move `../forks/python-packages/glueco-sdk` into this repo at `sdks/python/` (keep PyPI name `glueco-sdk`). Same slimming: keys, PoP signing, small httpx wrapper, connect helper. Delete `glueco-plugin-llm` (do not move it). Validate signing parity against the shared test vectors.

### 10.3 `packages/shared`

Gateway-internal only after this migration. Fold what the gateway uses (error codes, PoP canonical, duration presets, remaining schemas) into `apps/proxy/src/shared/` and **delete the package** — the npm-published `@glueco/shared` gets a final deprecation release. (If workspace ergonomics make folding painful, keeping the package private/unpublished is acceptable; deleting the five plugin packages is not negotiable.)

### 10.4 npm cleanup

`npm deprecate` all `@glueco/plugin-*` packages with a message pointing to the connector docs. Changesets config trimmed to the SDK package only.

### 10.5 Demo target app (`examples/demo-target-app`)

Rewrite as the reference implementation of BOTH connection paths:
- **Bearer tab:** paste gateway URL + token (or arrive via claim-code callback) → `GET /v1/grant` → model picker from resolved models → chat using the plain `openai` npm client with `baseURL: {gateway}/r/llm/{provider}` — demonstrating zero-Cookey-dependency usage.
- **PoP tab:** same flows via `@glueco/sdk`.
Delete `src/integrations/` entirely. Ship its `/.well-known/cookey-grant.json` as a live example of discovery.
Validation milestone: the `../forks/outsmart` Streamlit app connects with a static token and **no glueco imports** (config: gateway URL + token in Streamlit secrets). This is the acceptance test for Phase 1.

### 10.6 Marketplace repository (separate repo: `glueco/connectors`)

```
registry.json                       # index: [{id, name, description, resourceType, version,
                                    #          path, iconPath, official: true}]
connectors/llm-groq/connector.json
connectors/llm-groq/README.md
connectors/llm-groq/icon.svg
connectors/…
```

Served via raw.githubusercontent (or jsDelivr). The gateway's marketplace URL is a Settings value defaulting to this repo's raw `registry.json`. CI in that repo: JSON-schema validation of every connector + registry consistency check (publish the connector zod schema as JSON Schema from this repo to power it). Seed it with the five built-ins + at least OpenRouter and DeepSeek (pure-data `openai-compatible` connectors) to prove the point. Community additions via PR review.

---

## Part 11 — Documentation Rewrite

All in `docs/` unless noted. Delete `ADDING_PLUGINS.md` and `PACKAGE_ARCHITECTURE.md`.

| Doc | Contents |
|---|---|
| `README.md` (root) | Rewritten around the new story: problem → connect-your-key-safely → one-click deploy → connectors marketplace → grants. Fix all `glueco/gateway` URLs → `glueco/cookey`. |
| `docs/OWNER_GUIDE.md` | Deploy (Vercel + Neon via Vercel integration — document the marketplace-integration path so DB provisioning happens inside the deploy flow; only two env secrets to set by hand: `ADMIN_SECRET`, vault key; `CRON_SECRET` note), first-run, installing connectors, approving grants, templates, renewals, digests, revocation. Written for non-developers. |
| `docs/APP_DEVELOPER_GUIDE.md` | The grant document, builder page, well-known discovery, bearer usage in 5 languages (no SDK), `/v1/grant`, PoP + SDK for long-lived grants, claim-code flow. |
| `docs/CONNECTOR_SPEC.md` | Part 4 of this file, normativized, with the JSON Schema. |
| `docs/GRANT_SPEC.md` | Part 5, normativized, with the JSON Schema. |
| `docs/POP_PROTOCOL.md` | The v1 wire protocol + canonical signing + test vectors (extracted from shared). |
| `docs/SECURITY.md` | The Part 8 model, honestly stated — including the explicit paragraph that no scheme survives a fully-compromised, unwatched app, and that the gateway's answer is containment (caps/expiry/renewal), visibility (digests/last-IP), and default-dead access. |
| `docs/API_REFERENCE.md` | Regenerated for the Part 7 endpoint inventory. Add an `openapi.yaml` (KeyControl-style) covering app-facing + admin routes. |

---

## Part 12 — Execution Phases

Work in this order. Each phase must end green: `npm run build`, `npm run test`, and the phase's acceptance criteria. Do not start a phase before the previous one's acceptance criteria pass. Write tests alongside each phase, not after (target discipline: KeyControl has 31 test files; this repo has 1 — close that gap as you go, vitest for unit + integration).

### Phase 0 — Repo hygiene (small, do first)
1. Normalize the 369 file modes (`git add --renormalize` / re-chmod, commit).
2. `.gitignore`: add `.next/`, `dist/`, `*.tsbuildinfo`, `.env`; `git rm --cached` all currently-committed instances (both `.next` trees, all `packages/*/dist`, both `.env` files, `tsconfig.tsbuildinfo`s).
3. Finish the rename: every `glueco/gateway` reference in README/docs → `glueco/cookey`.
4. Fix the README mojibake (`### �️` on the Cryptographic Authentication heading).
**Accept:** clean `git status` after build+dev run; grep for `glueco/gateway` returns nothing.

### Phase 1 — Grants, tokens, Postgres-only (the risky novel part; runs against the EXISTING plugin system)
1. Migrations: Grant, GrantToken, ClaimCode, PopNonce, RateCounter, Notification (+ App/ResourcePermission/RequestLog columns; legacy-grant backfill).
2. Redis removal (Part 6 checklist); env cleanup; `CRON_SECRET`.
3. Pipeline: bearer auth path, grant-state stage, origin gate, egress-IP check; PoP nonce on Postgres.
4. Grant submit/approve flow: upgraded `/api/connect/prepare`, `/api/admin/grants/*`, `/v1/token/claim`, `/v1/grant`, well-known fetch, manual paste.
5. Approval screen v1 (functional per 9.3, minus templates/spend-projection — those are Phase 4; warning matrix and wildcard binding ARE in scope now). Document renderer started (review mode minimum).
6. Cron sweep + renewal notifications + inactivity suspend; in-app Notifications + bell.
7. Demo app bearer tab; Outsmart validation.
**Accept:** (a) Outsmart connects with a static token, zero glueco imports; (b) a pre-existing PoP app (demo PoP tab) still authenticates unchanged; (c) full test run green with Upstash env vars absent; (d) grant expiry/renewal/inactivity behaviors covered by integration tests.

### Phase 2 — Connectors as data
1. Adapter modules ×5 (ported from plugin `proxy.ts` files — read each before porting; parity tests comparing adapter output against recorded plugin behavior for a canned request per provider).
2. Generic enforcement engine + usage extraction + error mapping (4.3, 7.2).
3. Connector table, zod schema, registry service, built-in seeds; pipeline switched to connector registry.
4. Admin connectors UI (list/detail/credentials/enable); SSRF guard; install-by-URL with preview→review→freeze; update check + diff.
5. Custom builder + `http-passthrough` + test-call.
6. **Delete:** `packages/plugin-*` (all six incl. template), `proxy.plugins.ts`, `scripts/generate-enabled-plugins.mjs`, `apps/proxy/src/server/plugins/`, plugin refs in root package.json scripts. Fold/retire `packages/shared` per 10.3. npm deprecations.
**Accept:** (a) fresh deploy boots with 5 working built-in connectors (streaming incl. Gemini/Anthropic translation verified); (b) an OpenRouter connector installed by URL serves chat completions with model allowlist + token budget enforced, no redeploy; (c) an `http-passthrough` custom connector forwards a REST API with path patterns enforced; (d) SSRF guard unit tests (metadata IP, localhost, redirect-to-private) pass; (e) repo contains zero plugin packages.

### Phase 3 — Marketplace + builder + discovery polish
1. `glueco/connectors` repo (10.6) with CI, seeded (5 built-ins + OpenRouter + DeepSeek).
2. Marketplace page; Settings registry URL.
3. Public `/builder` page (9.7) with snippets + well-known file output.
4. Connector-update cron.
**Accept:** browse→install→use a connector end-to-end from the marketplace; builder page produces a grant JSON that round-trips through well-known fetch → approval → working token.

### Phase 4 — Product polish
1. Templates (5.6) + spend projection (5.7) into the approval screen; connector `pricing` filled for built-ins.
2. Admin restructure completed (9.1 fully; dashboard monolith deleted; per-page line budget enforced).
3. Digest cron + email channel (via configured mail connector) + anomaly hooks (7.3).
4. Theming: CSS-variable token system, dark/light with ThemeToggle, shadcn/ui pass over all admin surfaces; landing page (`app/page.tsx`) refresh telling the new story.
5. Docs (Part 11), `openapi.yaml`, GitHub secret-scanning registration for `ck_`.
6. Test sweep to KeyControl-level coverage: enforcement rules, ip-match, token lifecycle, claim reuse, grant states, connector install/update, adapters, cron behaviors.
**Accept:** docs complete; lighthouse-reasonable admin UI in both themes; test suite ≥ the enumerated coverage list.

### Deferred / out of scope (do not build now)
Docker Compose self-host path (later, after Vercel path is polished); multi-owner/multi-tenant anything; rotating tokens (rejected — see Part 1); executable plugins (rejected); connector auto-updates (deliberately manual); billing/metering beyond estimates; image-proxy sanitization for icons.

---

## Part 13 — Working Agreements for the Coding Agent

1. **Read before porting.** The five plugin `proxy.ts` files, `pipeline.ts`, `redis.ts`, `pop.ts`, and `access-policy.ts` are reference implementations whose behavior must be preserved through the refactor. When this document and the code disagree about *current* behavior, the code wins; when they disagree about *target* behavior, this document wins.
2. **Additive migrations**, backfills before drops, every migration runnable on a live database.
3. **No silent scope changes.** If something here proves wrong or infeasible mid-implementation, stop and flag it rather than improvising a different architecture.
4. **Preserve wire compatibility** for: PoP v1 headers/signing, `/r/...` URL shapes, `/api/connect/*` request/response shapes (legacy normalization included), `/api/resources` response shape (additive changes only).
5. **Tests accompany code** in the same phase. Every security item in Part 8 gets at least one test.
6. **Keep files small.** ~400-line ceiling for new/refactored files; extract.
7. **Match existing idiom** (logger usage, error-response helpers, zod-first validation, section-comment style).
8. **Never log or echo secrets** — provider keys, `ck_` tokens, claim/pairing codes, `ADMIN_SECRET`. There is a test for this; keep it passing.
