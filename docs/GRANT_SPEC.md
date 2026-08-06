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
| `app.homepage` | URL | | Domain is displayed explicitly. |
| `app.iconUrl` | URL | | Rendered client-side only, no referrer; never fetched server-side. |
| `runtime` | `server` \| `serverless` \| `cli` \| `browser` | ✔ | A policy anchor, not a promise: `server` prompts IP-pinning offers; `browser` forces the allowBrowser warning path. |
| `auth` | `bearer` \| `pop` | ✔ | Requested auth; the owner may override at approval. |
| `publicKey` | base64 Ed25519 | iff `auth: "pop"` | Becomes an `AppCredential`. |
| `requests[]` | array ≥1 | ✔ | See below. |
| `duration` | duration string | ✔ | `"30d"`, `"12h"`, `"4w"`, `"1y"`, a preset id (`"1_month"`), or `"forever"`. |
| `renewal.period` | duration string | | Requests a renewable grant; cannot be `"forever"`. |
| `budget` | object | | `dailyRequests`, `monthlyRequests`, `dailyTokens`, `monthlyTokens` — requested ceilings. |
| `redirectUri` | URL | | Enables claim-code token delivery. |

### `requests[]` entries

| Field | Type | Required | Notes |
|---|---|---|---|
| `resource` | `<type>:<provider>` or `<type>:*` | ✔ | Wildcards only in the `<type>:*` form. |
| `actions` | string[] ≥1 | ✔ | e.g. `["chat.completions"]`. |
| `reason` | string 1–300 | ✔ | Shown to the owner verbatim. |
| `constraints` | object | | Requested ceilings (e.g. `maxOutputTokens`, `allowStreaming`, `allowedModels`, `maxRecipients`). Owners can only tighten; loosening requires an explicit acknowledgment. |

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
wildcard bindings (request index → concrete connector ids), effective auth,
duration/renewal, budgets, per-resource constraint overrides, egress IP
allowlist, `allowBrowser`, and inactivity suspend days. Bindings materialize
into per-connector permission rows, so the data-plane permission model never
sees wildcards.

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
