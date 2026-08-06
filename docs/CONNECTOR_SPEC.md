# Connector Specification (specVersion 1)

A **connector** is a provider integration expressed as pure data: a JSON
document that names one of the gateway's built-in **adapters** and supplies
configuration. Connectors are validated at install, frozen into the database,
and **never re-fetched at request time**.

Normative schema: `apps/proxy/src/server/connectors/schema.ts` (zod); a JSON
Schema mirror is published in the
[marketplace repo](https://github.com/glueco/connectors)
(`connector.schema.json`). Size cap: **64 KB**.

## Document

| Field | Type | Required | Notes |
|---|---|---|---|
| `specVersion` | string | ✔ | Major must be `1`. |
| `id` | `^[a-z]+:[a-z0-9-]+$` | ✔ | `"llm:groq"` — equals the gateway's `resourceId`. Unique per gateway. |
| `name` | string | ✔ | Display name. |
| `version` | semver | ✔ | Of this document; drives update diffs. |
| `description`, `homepage`, `iconUrl` | | | |
| `resourceType` | string | ✔ | Must equal the prefix of `id`. |
| `adapter` | string | ✔ | One of the built-in adapter ids below. |
| `config` | object | ✔ | Validated by the adapter's own zod schema. |
| `allowedHosts` | bare hostnames[] | ✔* | **The egress pin.** Outbound requests may only target these hosts, asserted at the single execute choke point. *Derived from `config.baseUrl` when omitted; the baseUrl host must be present. |
| `actions` | map ≥1 | ✔ | See below. |
| `models` | string[] | | Model catalog: UI pickers, `/v1/grant`, and the default allowlist when a grant sets none. |
| `pricing` | map | | Per-model USD per 1M tokens (`inputPerMTok`/`outputPerMTok`); drives spend projections and cost estimates. |
| `credentials` | field[] | | Drives the credential form (name/type/label/required). |
| `errorMap` | map | | HTTP-status or provider-code strings → canonical error codes. |
| `errorCodePath` | dot path | | Where provider error codes live in error bodies. |

### Actions

```jsonc
"chat.completions": {
  "method": "POST",
  "path": "/chat/completions",     // appended to baseUrl (adapters may template it)
  "streaming": true,
  "enforce": { … },                 // see enforcement rules
  "usage": {                        // response dot-paths (replaces extractUsage)
    "inputTokens": "usage.prompt_tokens",
    "outputTokens": "usage.completion_tokens",
    "totalTokens": "usage.total_tokens",
    "model": "model"
  }
}
```

`http-passthrough` actions use `pathPattern` (glob: `*` within a segment,
`**` across) instead of `path`; requests supply their own sub-path.

### Enforcement rules (fixed set for specVersion 1)

`enforce` maps body dot-paths to rules bound to grant-permission constraint
keys. A field may carry one rule or an array of rules.

| Rule | Behavior |
|---|---|
| `allowedValues` | Field ∈ constraint array. Missing constraint: for `allowedModels`, the connector `models` catalog applies; else unrestricted. Missing field under an active allowlist → 403 (fail-closed). |
| `clampMax` | Field silently capped to the constraint (or the rule's `default` when neither field nor constraint exist). Never errors. |
| `allowFlag` | Constraint `false` → field must be absent/false. |
| `maxItems` | Array length (scalar counts as 1) ≤ constraint. |
| `domainAllowlist` | Email-ish field's domain(s) ⊆ constraint array; arrays element-wise; `Name <a@b.com>` supported. |
| `forbidField` | Constraint `false` → field must be absent (empty arrays count as absent). |

Unknown rule names are rejected at install. Unparseable bodies on actions
with any enforcement entries are rejected before the upstream is called.

## Adapters (the only real code)

| id | Speaks | Covers |
|---|---|---|
| `openai-compatible` | Bearer/header/query auth, JSON POST, SSE passthrough. Optional `extraHeaders` with `{credential:field}` placeholders. | Groq, OpenAI, and the entire OpenAI-compatible long tail (OpenRouter, DeepSeek, Together, Mistral, Ollama, vLLM…). |
| `anthropic-messages` | OpenAI-chat → `/v1/messages` translation both directions, incl. SSE chunks. | Anthropic. |
| `gemini-generative` | `messages` → `contents`/`parts`, `?key=` auth, `:generateContent` paths, both-direction translation incl. SSE. | Google AI Studio. |
| `mail-send` | JSON send-email, recipient normalization. | Resend and lookalikes. |
| `http-passthrough` | Credential injection + glob path allowlists, raw byte forwarding, streamed responses. No body enforcement (request limits still apply). | Any REST API — the custom-builder escape hatch. |

For `resourceType: "llm"` the gateway-canonical request/response format is
OpenAI chat-completions: any OpenAI SDK pointed at `/r/llm/<provider>` works
regardless of the underlying provider.

## Lifecycle

- **Sources**: `BUILTIN` (seeded), `REGISTRY` (marketplace), `URL`, `CUSTOM`
  (in-app builder) — shown as trust badges.
- **Install** (URL/registry): SSRF-guarded fetch (5s, 64 KB, no private
  ranges, ≤3 re-validated redirects) → validation → review screen (egress
  hosts first) → the **exact reviewed JSON** is frozen. Confirm-install
  echoes the previewed document back; nothing is re-fetched (no TOCTOU).
- **Updates**: a daily cron only *records* newer versions. Applying one is a
  manual review with a structured diff; added hosts are highlighted red.
- **Enable/disable**: disabled connectors 404 on the data plane and vanish
  from discovery, keeping their credentials.
- **Remove**: blocked while any active grant has permissions bound to the id.
- **Built-ins**: upserted on boot; an admin-modified copy is never
  overwritten (explicit "Restore built-ins" exists).
