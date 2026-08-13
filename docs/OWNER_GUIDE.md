# Owner Guide

You run the gateway. This guide takes you from zero to approving your first
app — no development experience needed.

**You'll need:** a GitHub account, a free Vercel account, one API key from a
provider you already pay (Groq, OpenAI, Gemini, Anthropic, or Resend), and
about ten minutes.

## 1. Deploy (about 5 minutes)

1. Click the deploy button in the [README](../README.md). Vercel copies the
   repo into your GitHub account and opens the setup screen.
2. When Vercel asks for storage, add a **Neon Postgres** database through
   the marketplace integration — `DATABASE_URL` is filled in automatically.
   Database migrations run on every deploy; there's nothing to run by hand.
3. Fill in the environment variables it prompts for:

   | Variable | What it is |
   |---|---|
   | `ADMIN_SECRET` | Your dashboard password. Make it long and random. |
   | `MASTER_KEY` | Encrypts your provider keys at rest. Generate with `openssl rand -base64 32`. **Losing it means re-entering every key.** |
   | `GATEWAY_URL` | Your deployment URL — `https://<project-name>.vercel.app`, or your own domain if you attach one. You can start with the vercel.app one and change it later. |
   | `CRON_SECRET` | Any random string. Lets the scheduled jobs run — expiry sweeps, renewal reminders, weekly digests. |

4. Deploy. When it finishes, open the URL and sign in with your
   `ADMIN_SECRET`.

> Changed an environment variable later (say, `GATEWAY_URL` after attaching
> a domain)? Vercel applies it on the **next** deploy — trigger a redeploy
> from the dashboard.

### Your first ten minutes

1. **Deploy** and sign in (above).
2. **Add a provider key** — Connectors → pick one → Credentials (section 2).
3. **Connect your first app** — Grants → Connect an app (section 3).
4. **Approve it** on the review screen, and the app is live through your
   gateway — watch it under Logs.

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
what limits. Some apps also propose **access levels** — preset bundles like
"Basic" vs. "Full" — and you pick one on the approval screen, the way OAuth
consent works. Grants always come *from the app*; you never write one by
hand. Two ways one reaches you:

- **From the app's URL** (easiest): Grants → Connect an app → paste the app's
  URL; its published request is fetched for review.
- **Pairing code**: generate a single-use 10-minute code and paste it into
  the app; its request appears under Grants.

The approval screen walks the decision in order. Everything on it *narrows*
what the app asked for — there's no control that grants more than the
request did.

1. **Which access level**, when the app proposes presets. No presets means
   there's nothing to pick — the app's request list *is* the proposal.
2. **What it may do.** Each request shows the app's reason word for word,
   with a switch to drop it entirely and a checkbox per operation — an app
   that asked to both chat *and* list models can be given just one. Wildcard
   requests ("any LLM") ask which of your providers to bind.
3. **Limits per service.** Per bound connector: which models are allowed,
   how long replies may be, whether streaming and tool-calling are on, mail
   recipient caps and domain allowlists. Only limits the gateway can
   actually enforce for that connector are offered — the controls are read
   off the connector's own enforcement rules, so nothing you set here is
   quietly ignored. Trimming the priciest model visibly lowers the spend
   projection.
4. **How long**: duration and renewal. Renewable grants die by default
   unless you renew — that's your safety net for forgotten apps.
5. **How much**: daily/monthly request, token and dollar caps. The
   **spend projection** shows worst-case dollars per day from the
   connector's pricing. Set no caps at all and the screen says so loudly.

   Those rates are editable: each connector's detail page has a
   **Pricing** table where you correct the per-model $/MTok to what
   *you* actually pay — a free tier is 0 / 0, an unlisted model can be
   priced, and blank means "unknown, don't estimate". Spend budgets,
   projections and per-request cost estimates all follow your rates;
   the frozen connector document is never modified.
6. **Security**: the screen **states** the credential type rather than
   offering it, because it isn't yours to pick — an app gets PoP signing
   keys only if it ships a public key and signs every request, and a
   static token otherwise. Hover the ⓘ for what each means. Static tokens
   carry a warning proportional to their blast radius: a copyable secret
   that works until expiry, or forever if you set none. Then pin the app's
   server IPs, keep browser calls blocked (the default), and auto-suspend
   after N idle days.

A summary panel stays on screen throughout: services, operations granted,
expiry, credential type and worst-case spend.

The form opens on **exactly what the app asked for** — that request is the
proposal you're reviewing. Everything on the screen subtracts from it, and
**Reset to what was requested** in the summary panel puts it all back.
If the app offers access levels, picking one is a shortcut that drops the
requests outside it; leaving it on *Everything requested* is a valid
answer, not a skipped step.

On approve, the app gets its token (shown once, plus it stays viewable on the
grant page until the app's first request) — or, for hosted apps, a one-time
claim code via redirect.

**Templates** (sidebar → Templates) are ready-to-use *permission packages*:
the services and operations you're willing to hand out, the ceilings on
each, and the duration, budget and hardening that go with them. Build one
there, or save the current approval as one straight from the screen.
Applying a template **narrows** a request to the package — it keeps what
the app asked for *and* the package allows, drops the rest, and never adds
anything the app didn't ask for. It reports what it dropped, and every
field stays editable after.

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
