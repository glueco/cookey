# Audit & Fix Log — 2026-08-07

Full-repo audit and fix pass over the post-migration state (see `update.md`
for the migration spec). Three parallel audits (admin UI ↔ API, approval
flow + builder + demo app, backend pipeline + cron + services) produced 45
findings; everything below is fixed and covered by the test suite
(126 tests passing) unless marked otherwise.

## Root cause of "nothing loads"

`GET /api/admin/login` always returns HTTP 200 with the auth state in the
body, but the admin layout (and the landing page) checked `res.ok` — so the
UI always believed it was signed in while every admin API call 401'd.
Symptoms: overview stuck on "Loading…", grants showing an empty state,
marketplace bouncing to `/dashboard` → `/overview` on its 401, buttons
silently failing, no sign-in screen ever shown, sign-out appearing broken.
Fixed by checking `data.authenticated` in both places; sign-out now clears
the query cache and flips the gate.

## Security fixes (gateway)

- **`POST /api/connect/approve` had no auth** — the "sessionToken" is the
  grant id, which is handed to the requesting app by `/api/connect/prepare`,
  so any app could self-approve its own grant and mint a bearer token.
  Now requires owner auth (`checkAdminAuth`).
- **SSRF guard bypass** via non-canonical IP literals (`https://2130706433/`,
  octal `0177.0.0.1`, short `127.1`, hex-mapped `[::ffff:7f00:1]`). The
  literal-host path now only accepts canonical forms (`net.isIP`), rejects
  numeric-looking non-canonical hosts outright, and normalizes hex-form
  IPv4-mapped IPv6 before the private-range check. Regression tests added.
- **Streaming token-budget bypass** — streamed responses never recorded
  usage, so `dailyTokens` caps didn't apply to `stream: true` requests.
  A passthrough usage-scanning stream (`server/gateway/stream-usage.ts`)
  now extracts usage from SSE chunks and records it at stream end; the
  Anthropic adapter emits a final OpenAI-style usage chunk to feed it.
- **Budget fan-out multiplication** — grant-level budgets were enforced
  per permission row, multiplying the ceiling by (bound connectors ×
  actions). Budget checks now aggregate usage across all permissions of
  the grant. `/v1/grant.remaining` reports grant-wide numbers.
- **Claim-code exchange race** — two concurrent exchanges could both
  receive the token. Consumption is now an atomic conditional update;
  the loser gets the 410 + owner notification.
- **Double-approval race** — `approveGrant` now claims PENDING→ACTIVE with
  a conditional update inside the transaction; the loser 409s.
- **PoP nonce burn** — nonces were consumed before signature verification
  (unauthenticated callers could grow the table / pre-burn nonces).
  Consumption now happens only after a valid signature.
- **PoP over non-UTF-8 bodies** — auth hashed a decoded string; raw body
  bytes are now passed through, fixing signatures on binary payloads
  (http-passthrough uploads).
- **Egress IP list fail-open** — whitespace/comma-only `egressIps` is
  normalized to null at approval, and `ipMatchesList` fails closed on an
  empty pattern list. `/v1/grant` also enforces grant state + egress IPs
  (it previously skipped both).
- **Client IP spoofing** — `getClientIp` no longer trusts the leftmost
  `x-forwarded-for` entry (attacker-appendable); trust order is
  `x-vercel-forwarded-for` → `x-real-ip` → last XFF hop.
- **First-use token wipe** (spec 5.4 hard requirement) and last-used
  tracking were fire-and-forget — on serverless the writes could be
  dropped. Now awaited.

## Correctness fixes (gateway)

- **Renewal produced an instantly-dead grant**: `renewGrant` never extended
  `expiresAt`, so `computeTokenExpiry` stayed min'd to the old date. Renewal
  now extends the grant expiry with the new period end and reactivates
  permissions.
- `x-cookey-clamped` header now lists the clamped field names (spec 4.3)
  instead of `"true"`.
- `maxItems` rules sharing a constraint key (to/cc/bcc → `maxRecipients`)
  are capped on their combined count, not per-field.
- Built-in connector seeds upgrade in place when the shipped version is
  semver-higher (source still `BUILTIN`); previously updates never landed.
- Connector update cron: only a strictly-higher semver for the SAME
  connector id counts as an update (no downgrade/swap offers).
- `createNotificationOnce` dedupes against read notifications too (a
  dismissed notice no longer reappears every cron run).
- Anthropic stream transformer: `flush()` handles a final line without a
  trailing newline and always emits `data: [DONE]`; multiple system
  messages concatenate instead of keeping only the last.
- Sweep anomaly SQL uses UTC day boundaries (matches budget counters) and
  a true 7-day window; sweep cron now hourly per spec (`vercel.json`).
- `/v1/token/claim` returns the expiry of the token actually handed out.
- `/v1/grant` merges constraints across permissions (tightest wins)
  instead of reporting `perms[0]` only.
- `GATEWAY_URL` fallbacks: approval/claim/status URLs fall back to the
  request origin instead of producing `?gateway=` (empty).

## Admin UI fixes

- Error states everywhere a failed query previously lied: overview
  (eternal "Loading…"), grants list ("No grants yet"), grant detail
  (eternal "Loading…"), logs ("0 entries"), connectors list (silent empty
  grid), connector detail, settings. All render the error + Retry.
- Settings: batch save (`PATCH { settings: {...} }`) replaces the 8-call
  loop that could half-save; form gated on load so a failed GET can't be
  saved back as blanks; restore-builtins invalidates the connectors query;
  `gatewayName` and `inactivitySuspendDaysDefault` settings are now
  actually consumed (login screen/sidebar title, approval-form default).
- Templates: "New template" opens the form (state bug made it a no-op).
- Marketplace: no more redirect-to-dashboard on 401; unreachable-registry
  banner explains where to change the URL.
- Custom connectors are now editable: builder `?edit=<connectorId>` mode,
  `{ document, replace: true }` API path (CUSTOM-source only), "Edit in
  builder" link on the detail page; test-call guarded against missing
  actions/network errors.
- Credentials: re-saving no longer wipes non-secret config (server-side
  merge; blank secret on update keeps the stored key); form seeds
  non-secret fields from stored config.
- Notifications bell: per-item mark-read + deep links (grant payloads →
  grant detail, connector updates → connectors).
- Dark mode: theme variables are class-driven (`:root.dark`) instead of
  the OS media query, so the toggle works.

## Approval / builder / demo app

- Approval form: non-preset requested durations render an "As requested"
  option (the dropdown previously showed "24 hours" while granting 28d);
  renewal days clamp to ≥1; validation `details` surface in the error
  banner; PoP approvals with a `redirectUri` redirect back with
  `status=approved&app_id=…&gateway=…`.
- Builder: real `publicKey` input for PoP (placeholder used to emit an
  invalid document), valid defaults for added request rows, `import os`
  in Python snippets (also on the token success screen).
- Demo app: PoP polling fallback actually arms (was dead code — the flow
  could never complete), callback contract matches the gateway, bearer
  chat tab handles empty model lists (free-text input + disabled Send with
  hint), key rotation swaps the in-process signing seed instead of
  bricking the connection.

## Visual refresh

Brand: **iris accent (`#5B5BD6`) on graphite neutrals** — a single-point
change in `tailwind.config.js` (`primary` + the `slate` override) plus
the token block at the top of `globals.css`. The mark is a keyhole in a
gradient squircle (`src/components/CookeyLogo.tsx`, favicon
`src/app/icon.svg`); keep the two in sync, they share one path.

Shared UI kit under `src/components/ui` (toasts, confirm dialog,
segmented control, switch, tag input, stat tiles, usage meters, relative
time) — reach for these before writing bespoke markup, that's what keeps
spacing, focus rings and dark mode consistent.

Grouped sidebar with a pending-grants badge, redesigned login and landing
hero, dashboard with 14-day traffic/spend trends, searchable grants list,
a form-based template creator (was a raw-JSON textarea), and a rebuilt
approval screen — see below. Demo app tracks the same palette.

## Owner control over what a grant actually gets

The approval screen previously let the owner set duration, budgets and
hardening, but every action a request named was granted wholesale, and
`decisions.constraints` existed in the schema with no UI behind it.

- `GrantDecisions.actions` (request index → allowed action subset) lets
  the owner drop individual verbs. Absent = everything requested; empty
  = the request is dropped. `approveGrant()` rejects any action the
  request did not ask for — owners tighten, never widen.
- `server/connectors/capabilities.ts` derives owner-facing controls from
  each connector's own `enforce` map, so the screen offers exactly the
  limits the engine will honour (models, reply length, streaming, tools,
  recipient caps, domain allowlists) and nothing that would be silently
  ignored. `sanitizeConstraints()` re-checks this server-side.

## Known gaps / follow-ups

- Streamed-request usage is recorded for budgets but not written back to
  the already-created `RequestLog` row (audit metadata for streams stays
  empty).
- DNS-rebinding TOCTOU in `safe-fetch` (resolve-then-fetch) remains, as
  before the audit.
- The marketplace registry repo (`glueco/connectors`) doesn't exist yet,
  so the default registry URL 404s until Phase 3.
