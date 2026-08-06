# Owner Guide

You run the gateway. This guide takes you from zero to approving your first
app — no development experience needed.

## 1. Deploy (about 5 minutes)

1. Click the deploy button in the [README](../README.md). Vercel forks the
   repo and starts a deployment.
2. When Vercel asks for storage, add a **Neon Postgres** database through the
   marketplace integration — `DATABASE_URL` is filled in automatically.
3. Set two environment variables by hand:
   - `ADMIN_SECRET` — your dashboard password. Make it long and random.
   - `MASTER_KEY` — encrypts your provider keys at rest. Generate with
     `openssl rand -base64 32`. **Losing it means re-entering every key.**
4. Recommended: set `CRON_SECRET` (any random string) so the scheduled
   jobs — expiry sweeps, renewal reminders, weekly digests — can run.
5. Set `GATEWAY_URL` to your deployment URL (e.g. `https://gw.you.dev`).

Open your deployment, enter the admin secret, and you're in.

## 2. First run: add a provider key

Go to **Connectors**. Five providers ship built in (Groq, OpenAI, Gemini,
Anthropic, Resend); the **Marketplace** has more, and **Build custom** wraps
any other REST API.

Open a connector → **Credentials** → paste your API key → Save. The key is
envelope-encrypted with your `MASTER_KEY`; nothing but the gateway can read
it back.

> The review screen for any connector shows, at the top, exactly which hosts
> your credential will be sent to. That list is frozen at install — a
> connector can never quietly start talking to a new host.

## 3. Approving an app

Apps request access with a **grant**: a small document saying which
resources they want, *why* (you see their reasons word for word), and under
what limits. Three ways a grant reaches you:

- **From the app's URL** (easiest): Grants → Add app → paste the app's URL.
- **Pairing code**: generate a single-use 10-minute code and paste it into
  the app; its request appears under Grants.
- **Paste**: paste a grant JSON the developer sent you.

The approval screen lets you decide:

- **Which providers** wildcard requests bind to ("any LLM" → you pick).
- **Auth**: a static token (works everywhere, zero code for the app) or PoP
  signing keys. For long-lived static tokens you'll see a red warning — a
  leaked token is silently usable until expiry; renewable grants or PoP are
  the safer defaults for anything long-lived.
- **Duration & renewal**: renewable grants die by default unless you renew —
  that's your safety net for forgotten apps.
- **Budgets**: daily/monthly request and token caps. The **spend projection**
  shows worst-case dollars per day from the connector's pricing. If you set
  no caps at all, the screen says so loudly.
- **Hardening**: pin the app's server IPs, keep browser calls blocked
  (default), auto-suspend after N idle days.

On approve, the app gets its token (shown once, plus it stays viewable on the
grant page until the app's first request) — or, for hosted apps, a one-time
claim code via redirect.

## 4. Living with grants

- **Grants** page: status, auth type, expiry, last-used time and IP.
- **Renewals**: you're notified 3 days before a period ends; renew in one
  click or let it lapse.
- **Suspend / revoke**: suspension is reversible; revocation is immediate
  and final. Regenerating a token invalidates the old one.
- **Logs**: every request — allowed or denied, with reasons, latency, and
  estimated cost.
- **Weekly digest** (Settings → digest): per-app usage summary, in-app and
  optionally by email through your mail connector.
- **Anomalies**: an app suddenly doing 3× its normal traffic triggers a
  notification (optional auto-suspend in Settings).

## 5. Connectors: install, update, remove

- **Marketplace** installs come from the curated registry; **Install from
  URL** works with any connector JSON but is badged *Unverified*.
- **Updates are never automatic.** A daily check records when a newer version
  exists; you review a diff — with any newly added hosts highlighted in
  red — and re-approve explicitly.
- Removal is blocked while active grants are bound to the connector.
- **Restore built-ins** (Settings → danger zone) resets the shipped five.

## 6. Troubleshooting

- **App reports 401**: token revoked/expired, or the grant lapsed. Check the
  grant page.
- **App reports 403 with `ERR_BROWSER_BLOCKED`**: the app is calling from a
  browser. That's blocked by default; only enable `allowBrowser` for apps
  that genuinely run in the browser and that you trust.
- **`ERR_IP_BLOCKED`**: the app's IP changed and you have an IP pin. Update
  the allowlist on the grant.
- **Provider errors** pass through with the provider's message (credentials
  are redacted). `QUOTA_EXCEEDED` means your provider account, not Cookey.
- **Support**: [GitHub issues](https://github.com/glueco/cookey/issues).
