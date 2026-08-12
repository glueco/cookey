# API Reference

Machine-readable version: [`openapi.yaml`](openapi.yaml). All request/response
bodies are JSON; errors use `{ "error": { "code", "message", "details?" } }`.

## Data plane (app-facing)

Auth: `Authorization: Bearer ck_…` **or** PoP headers
(`x-pop-v`, `x-app-id`, `x-ts`, `x-nonce`, `x-sig`). Sending both → 400.

| Route | Notes |
|---|---|
| `ANY /r/{resourceType}/{provider}/{...path}` | The proxy. OpenAI-compat aliasing: `/r/llm/groq/v1/chat/completions` ≡ action `chat.completions`. `http-passthrough` connectors match the remaining path against their `pathPattern` allowlists and forward it verbatim. SSE streaming supported. |
| `GET /v1/grant` | The resolved contract: resources, actions, effective model lists, constraints, remaining budgets. |
| `POST /v1/token/claim` | `{ code }` → `{ token, grantId, expiresAt }`. Single-use; reuse → 410 + owner notification. IP rate-limited. |
| `GET /v1/token/verify` | `Authorization: Bearer ck_…` → `{ valid, grantId, expiresAt, services, operations }` or `{ valid: false, reason }`. Side-effect-free credential check: does not count as the token's first use and meters nothing. IP rate-limited. |
| `GET /api/resources` | Public discovery of configured, enabled connectors. |
| `POST /api/connect/prepare` | `{ connectCode, grant }` → `{ grantId, sessionToken, approvalUrl, expiresAt }`. Only the grant document format is accepted; anything else gets a clear 400. |
| `GET /api/connect/status?session={grantId}` | `pending` \| `approved` (+`appId`, `gatewayUrl`) \| `rejected` \| `expired`. |
| `POST /api/connect/rotate` | PoP credential rotation (signed with the old key). |
| `GET /api/app/status` | PoP-authed self-status incl. grant state. |

## Admin (cookie session or `Authorization: Bearer ${ADMIN_SECRET}`)

| Route | Notes |
|---|---|
| `GET/POST/DELETE /api/admin/login` | Session check / login `{ secret }` / logout. |
| `GET /api/admin/grants[?status=]` | List grants with tokens + counts. |
| `POST /api/admin/grants` | **Removed (410).** Grants only arrive from the app: `POST /api/connect/prepare` or well-known fetch. |
| `GET /api/admin/grants/{id}` | Detail: frozen document, decisions, permissions + usage, token panel, audit tail. |
| `PATCH /api/admin/grants/{id}` | `{ action: approve\|deny\|revoke\|renew\|suspend\|reactivate\|regenerate_token, decisions? }`. |
| `POST /api/admin/grants/fetch` | `{ appUrl }` → SSRF-guarded fetch of `/.well-known/cookey-grant.json` → PENDING grant. |
| `GET /api/admin/connectors` | Installed connectors + credential status + adapter ids. |
| `POST /api/admin/connectors` | `{ url, preview: true }` → review payload; `{ url, document, registry? }` → confirm-install (freezes the echoed document); `{ document }` → custom install; `{ restoreBuiltins: true }`. |
| `GET/PATCH/DELETE /api/admin/connectors/{id}` | Detail / `{ enabled }` \| `{ action: check_update }` \| `{ action: apply_update, document }` / remove (409 while grants bound). |
| `GET /api/admin/connectors/marketplace[?refresh=1]` | Registry index (SSRF-guarded, 10-min cache) + installed map. |
| `POST /api/admin/connectors/test-call` | `{ connectorId, action, input?, subPath? }` — builder test through the real enforcement/adapter path. |
| `GET/POST/DELETE /api/admin/templates` | Permission-template CRUD (`DELETE ?id=`, upsert by name). `values` = `{ services[], durationMs, renewal, budget, inactivitySuspendDays, allowBrowser }`; `services[]` is the package (`{ resourceId, actions[], constraints? }`). |
| `GET /api/admin/capabilities` | Services this gateway can grant: operations, enforceable limits, model catalogue/pricing, and whether credentials are stored. Feeds the template editor. |
| `GET/PATCH /api/admin/settings` | All settings / `{ key, value }`. |
| `GET /api/admin/notifications` · `PATCH /api/admin/notifications/{id\|all}` | Feed + mark-read. |
| `GET /api/admin/stats` | Overview aggregates. |
| `GET /api/admin/logs` | RequestLog with `grantId/connectorId/decision/since/until/page` filters. |
| `POST /api/admin/pairing/generate` | Single-use pairing string (10-min TTL). |
| `GET/POST/DELETE /api/admin/resources` | Provider credentials (envelope-encrypted). |
| `GET/PATCH/PUT/DELETE /api/admin/apps` | Direct app/permission management (grants are the primary surface). |
| `POST /api/admin/sweep` | Run the housekeeping sweep now. |

## Cron (Vercel, `Authorization: Bearer ${CRON_SECRET}`)

| Route | Schedule | Work |
|---|---|---|
| `/api/cron/sweep` | daily | Expiry (grants/periods/permissions), inactivity suspension, renewal-due notices, anomaly flags, PopNonce/ClaimCode/ConnectCode/RateCounter pruning. |
| `/api/cron/connector-updates` | daily | Records `updateAvailable` for REGISTRY/URL connectors + notification. Never auto-applies. |
| `/api/cron/digest` | weekly | Per-grant usage digest → notification (+ email via configured mail connector). |
