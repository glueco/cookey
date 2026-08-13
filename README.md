# 🍪 Cookey

**Connect your key safely — instead of trusting apps with it.**

Cookey is a **self-hosted personal API gateway**. You deploy your own instance
with one click, store your paid API keys in it (OpenAI, Groq, Gemini,
Anthropic, Resend — anything), and grant third-party apps **controlled,
time-limited, budget-capped access** to those keys, without the apps ever
seeing them.

Every deployment is single-tenant: one owner, their keys, their rules. There
is no central service.

- **For owners**: stop pasting API keys into apps. Grant scoped access,
  watch spend projections, revoke instantly.
- **For app developers**: build BYOK (bring-your-own-key) apps without asking
  users for raw API keys — a static token works with any HTTP client or an
  unmodified OpenAI SDK. **No SDK required.**

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/glueco/cookey)

Postgres is the **only** backing service (pair with
[Neon](https://neon.tech) through the Vercel integration). Set two secrets:
`ADMIN_SECRET` and `MASTER_KEY` (plus `CRON_SECRET` for scheduled jobs).
Full walkthrough: [docs/OWNER_GUIDE.md](docs/OWNER_GUIDE.md).

## How it works

```
 App author                    Gateway owner                     Providers
 ──────────                    ─────────────                     ─────────
 writes grant.json  ────────►  reviews on one approval screen
 (or uses /builder)            binds llm:* → installed connectors
                               sets budgets, expiry, IP pins
                                       │ approve
                                       ▼
                               mints ck_ token ──────────────►  app
                                       │
 app calls /r/llm/groq/…  ──►  auth → grant checks → limits
 (bearer or PoP)               → connector adapter  ─────────►  api.groq.com
                               → usage recorded, budgets enforced
```

**Connectors** are provider integrations as *pure data* — reviewed JSON
documents naming one of five built-in adapters (OpenAI-compatible, Anthropic,
Gemini, mail, generic HTTP passthrough). Install them from the
[marketplace](https://github.com/glueco/connectors), from any URL (with a
review screen showing exactly which hosts your credential will reach), or
build one in the in-app builder. The gateway freezes the document at install
and never fetches it again.

**Grants** are contracts apps write: which resources, why, under what limits.
You approve them on a screen that quotes every reason verbatim, projects
worst-case spend, and lets you tighten everything. Approved apps authenticate
with a static `ck_` bearer token (zero code) or Ed25519 PoP keys (long-lived
grants, via the slim [`@glueco/sdk`](packages/sdk)).

## Repo layout

```
apps/proxy/          # the gateway (Next.js App Router + Prisma/Postgres)
packages/sdk/        # @glueco/sdk — PoP signing only, zero deps
sdks/python/         # glueco-sdk for Python (PoP signing)
sdks/test-vectors.json  # cross-language PoP wire-protocol vectors
examples/demo-target-app/  # reference consumer (bearer + PoP tabs)
docs/                # owner guide, app developer guide, specs, security
```

## Documentation

| Doc | For |
|---|---|
| [OWNER_GUIDE](docs/OWNER_GUIDE.md) | Deploying and running your gateway |
| [APP_DEVELOPER_GUIDE](docs/APP_DEVELOPER_GUIDE.md) | Connecting your app (mostly: you don't need an SDK) |
| [GRANT_SPEC](docs/GRANT_SPEC.md) | The grant document format |
| [CONNECTOR_SPEC](docs/CONNECTOR_SPEC.md) | The connector document format |
| [POP_PROTOCOL](docs/POP_PROTOCOL.md) | The PoP v1 wire protocol |
| [SECURITY](docs/SECURITY.md) | The security model, honestly stated |
| [API_REFERENCE](docs/API_REFERENCE.md) | Endpoint inventory (+ `docs/openapi.yaml`) |

## Development

```bash
npm install
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=cookey postgres:16
cp apps/proxy/.env.example apps/proxy/.env   # fill in DATABASE_URL etc.
npm run db:migrate
npm run dev:proxy        # gateway on :3000
npm test                 # vitest (unit + DB integration)
```

## License

MIT
