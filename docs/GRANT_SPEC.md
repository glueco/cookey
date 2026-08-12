# Grant Specification (specVersion 1)

A **grant document** is the contract between a target app and a Cookey
gateway. The app author writes it; the owner reviews and approves it; the
gateway freezes the submitted JSON on the Grant row and executes only from
that frozen copy.

Normative schema: `apps/proxy/src/server/grants/schema.ts` (zod). Size cap:
**32 KB**. Unknown `specVersion` majors are rejected at submission.

## Document

| Field | Type | Required | Notes |
|---|---|---|---|
| `specVersion` | string | ✔ | Major must be `1`. |
| `app.name` | string 1–100 | ✔ | Shown verbatim on the approval screen. |
| `app.description` | string ≤500 | | |
| `app.homepage` | http(s) URL | | Domain is displayed explicitly. |
| `app.iconUrl` | http(s) URL | | Rendered client-side only, no referrer; never fetched server-side. |
| `runtime` | `server` \| `serverless` \| `cli` \| `browser` | ✔ | A policy anchor, not a promise: `server` prompts IP-pinning offers; `browser` forces the allowBrowser warning path. |
| `auth` | `bearer` \| `pop` | ✔ | **Decides** the credential type, together with `publicKey` — not a preference. `pop` iff the app ships a key and signs its requests; anything else is a static bearer token. The owner cannot override it, because no owner preference can make an app sign. |
| `publicKey` | base64 Ed25519 | iff `auth: "pop"` | Becomes an `AppCredential`. |
| `requests[]` | array ≥1 | ✔ | The ask. This is what the owner approves by default. See below. |
| `options[]` | array 1–5 | | Optional narrower bundles the owner may pick instead — see below. |
| `duration` | duration string | ✔ | `"30d"`, `"12h"`, `"4w"`, `"1y"`, a preset id (`"1_month"`), or `"forever"`. |
| `renewal.period` | duration string | | Requests a renewable grant; cannot be `"forever"`. |
| `budget` | object | | `dailyRequests`, `monthlyRequests`, `dailyTokens`, `monthlyTokens`, `dailyCostUsd`, `monthlyCostUsd` — requested ceilings. Cost caps are USD, enforced from connector pricing estimates. |
| `redirectUri` | http(s) URL | | Enables claim-code token delivery. Non-http(s) schemes are rejected at intake — the approval screen navigates here. |

### `requests[]` entries

| Field | Type | Required | Notes |
|---|---|---|---|
| `resource` | `<type>:<provider>` or `<type>:*` | ✔ | Wildcards only in the `<type>:*` form. |
| `actions` | string[] ≥1 | ✔ | e.g. `["chat.completions"]`. |
| `reason` | string 1–300 | ✔ | Shown to the owner verbatim. |
| `constraints` | object | | Requested ceilings (e.g. `maxOutputTokens`, `allowStreaming`, `allowedModels`, `maxRecipients`). Owners can only tighten; loosening requires an explicit acknowledgment. |

### `options[]` entries — access levels (OAuth-consent style) — OPTIONAL

Options are for apps that genuinely have tiers ("read-only" vs "full").
They are **not** how consent works — `requests[]` is. The app's request
list is the proposal on the table, and it is what the approval screen
opens on and what an owner approves if they pick nothing.

An option is purely a narrowing: accepting one materializes **only that
option's requests** into permissions, and freezes its id in
`decisions.optionId`. Omitting `optionId` at approval grants the
document's own `requests[]`. Naming an option the document doesn't
define is rejected.

Most apps should ship no options at all.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string 1–40 | ✔ | Unique within the document. |
| `name` | string 1–60 | ✔ | e.g. `"Basic"`, `"Full access"`. |
| `description` | string ≤300 | | Plain-language pitch shown on the card. |
| `recommended` | boolean | | Preselects the option and shows a "Suggested" badge. |
| `requests` | number[] ≥1 | ✔ | Indexes into the top-level `requests[]`; out-of-range indexes are rejected at submission. |
| `budget` | object | | Overrides the document-level `budget` for this option. |
| `duration` | duration string | | Overrides the document-level `duration`. |

```jsonc
"options": [
  { "id": "chat-only", "name": "Game only", "recommended": true,
    "description": "Just the AI players — no email access.",
    "requests": [0], "budget": { "dailyRequests": 100 }, "duration": "7d" },
  { "id": "full", "name": "Game + email summaries",
    "requests": [0, 1], "budget": { "dailyRequests": 200 } }
]
```

An app with only one way to connect declares no options.

## How a grant reaches the gateway

Grants only arrive **from the app** — there is no manual authoring path
in the dashboard:

1. **Pairing code**: the owner generates a single-use code; the app
   submits its document to `POST /api/connect/prepare`.
2. **Well-known discovery**: the app publishes its document at
   `/.well-known/cookey-grant.json`; the owner pastes the app's URL and
   the gateway fetches it (SSRF-guarded).

## Lifecycle

```
PENDING → ACTIVE → (SUSPENDED_INACTIVITY | SUSPENDED_ANOMALY | SUSPENDED_MANUAL) ⇄ ACTIVE
terminal: EXPIRED, REVOKED, DENIED
```

Data-plane requests against any non-ACTIVE grant fail with a state-specific
403 (`ERR_GRANT_SUSPENDED`, `ERR_GRANT_EXPIRED`, …).

- **Expiry**: an hourly sweep expires grants past `expiresAt` and renewable
  grants past `currentPeriodEnd`.
- **Renewal**: owners are notified 3 days before a period ends; renewal
  extends the period and the **same** token's expiry (no reissue — target
  apps hold read-only config).
- **Inactivity**: optional N-days-idle auto-suspend, one-click reactivate.

## Approval decisions

The owner's choices are frozen alongside the document as `decisions`:
the accepted `optionId` (when one was picked), wildcard `bindings`
(request index → concrete connector ids), the granted `actions` subset,
duration/renewal, budgets, per-resource `constraints` overrides, egress IP
allowlist, `allowBrowser`, and inactivity suspend days. `decisions.auth`
is recorded too, but it is **derived from the document**, not chosen: the
server computes it on approval and ignores any value the client sends. Bindings materialize
into per-connector permission rows, so the data-plane permission model never
sees wildcards.

**Owners tighten, never widen.** Two fields carry that rule:

- `actions` maps a request index to the subset of that request's `actions`
  the owner allowed. Omitting an index grants everything the request asked
  for; an empty array drops the request entirely. `approveGrant()` rejects
  any action the request did not name, so a stale or hand-rolled approval
  payload cannot mint a permission the app never requested.
- `constraints` is keyed by concrete resource id and is merged **over** the
  request's own constraints when permissions are built. The approval route
  first drops any key the bound connector's `enforce` map doesn't reference
  — an unenforceable constraint on a permission is worse than none, because
  the grant detail page would display it as a limit that isn't real.

The controls the approval screen offers are derived from those same
`enforce` maps (`server/connectors/capabilities.ts`), so a connector that
cannot cap reply length simply doesn't show the control.

## Credentials

- **Bearer**: `ck_` + 40 base62 CSPRNG chars. Stored as SHA-256 only (an
  encrypted copy exists solely until the token's first use so the owner can
  re-copy it). Presented as `Authorization: Bearer ck_…`. Expiry =
  `min(grant expiry, current period end)`.
- **PoP**: Ed25519 keypair; the gateway stores the public key. See
  [POP_PROTOCOL.md](POP_PROTOCOL.md).
- **Claim codes**: single-use, 10-minute, hash-stored; delivered via
  `redirectUri?code=…&gateway=…` and exchanged at `POST /v1/token/claim`.
  Reuse returns 410 and notifies the owner.

## Runtime introspection

`GET /v1/grant` (bearer or PoP) returns the resolved contract: per-resource
actions, effective model lists (connector catalog ∩ `allowedModels`),
constraints, and remaining budgets.
