<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/cookey-monogram-dark.svg">
    <img src="docs/brand/cookey-monogram-light.svg" alt="Cookey" width="80" height="80">
  </picture>
</p>

<h1 align="center">Cookey</h1>

<p align="center"><strong>Connect your key safely — instead of trusting apps with it.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@glueco/sdk"><img src="https://img.shields.io/npm/v/%40glueco%2Fsdk?label=%40glueco%2Fsdk" alt="npm"></a>
  <a href="https://pypi.org/project/glueco-sdk/"><img src="https://img.shields.io/pypi/v/glueco-sdk?label=glueco-sdk" alt="PyPI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

Cookey is a **self-hosted personal API gateway**. You deploy your own
instance with one click, store your paid API keys in it (OpenAI, Groq,
Gemini, Anthropic, Resend — anything), and grant third-party apps
**controlled, time-limited, budget-capped access** to those keys, without
the apps ever seeing them.

Every deployment is single-tenant: one owner, their keys, their rules.
There is no central service.

- **For owners** — stop pasting API keys into apps. Grant scoped access,
  watch spend projections, revoke instantly.
- **For app developers** — build BYOK (bring-your-own-key) apps without
  asking users for raw API keys. A static token works with any HTTP client
  or an unmodified OpenAI SDK. **No SDK required.**

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fglueco%2Fcookey&project-name=cookey&repository-name=cookey&env=ADMIN_SECRET,MASTER_KEY,GATEWAY_URL,CRON_SECRET&envDescription=ADMIN_SECRET%20is%20your%20dashboard%20password%2C%20MASTER_KEY%20encrypts%20provider%20keys%20(openssl%20rand%20-base64%2032)%2C%20GATEWAY_URL%20is%20your%20deployment%20URL%2C%20CRON_SECRET%20protects%20scheduled%20jobs&envLink=https%3A%2F%2Fgithub.com%2Fglueco%2Fcookey%2Fblob%2Fmain%2Fdocs%2FOWNER_GUIDE.md)

Postgres is the **only** backing service (pair with
[Neon](https://neon.tech) through the Vercel marketplace integration).
First-time walkthrough, from zero to your first approved app:
**[docs/OWNER_GUIDE.md](docs/OWNER_GUIDE.md)**.

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
documents naming one of five built-in adapters (OpenAI-compatible,
Anthropic, Gemini, mail, generic HTTP passthrough). Install them from the
[marketplace](https://github.com/glueco/connectors), from any URL (with a
review screen showing exactly which hosts your credential will reach), or
build one in the in-app builder. The gateway freezes the document at
install and never fetches it again.

**Grants** are contracts apps write: which resources, why, under what
limits. You approve them on a screen that quotes every reason verbatim,
projects worst-case spend, and lets you tighten everything. Approved apps
authenticate with a static `ck_` bearer token (zero code) or Ed25519 PoP
keys (long-lived grants, via the slim [`@glueco/sdk`](packages/sdk) /
[`glueco-sdk`](sdks/python)).

## Documentation

Start with the guide for your role; the index lives at
[docs/README.md](docs/README.md).

| Doc | For |
|---|---|
| [OWNER_GUIDE](docs/OWNER_GUIDE.md) | Deploying and running your gateway — the first-time setup walkthrough |
| [APP_DEVELOPER_GUIDE](docs/APP_DEVELOPER_GUIDE.md) | Connecting your app (mostly: you don't need an SDK) |
| [GRANT_SPEC](docs/GRANT_SPEC.md) | The grant document format |
| [CONNECTOR_SPEC](docs/CONNECTOR_SPEC.md) | The connector document format |
| [POP_PROTOCOL](docs/POP_PROTOCOL.md) | The PoP v1 wire protocol |
| [SECURITY](docs/SECURITY.md) | The security model, honestly stated |
| [API_REFERENCE](docs/API_REFERENCE.md) | Endpoint inventory (+ [`openapi.yaml`](docs/openapi.yaml)) |

## Repo layout

```
apps/proxy/                # the gateway (Next.js App Router + Prisma/Postgres)
packages/sdk/              # @glueco/sdk — PoP signing only, zero deps
sdks/python/               # glueco-sdk for Python (PoP signing)
sdks/test-vectors.json     # cross-language PoP wire-protocol vectors
examples/demo-target-app/  # reference consumer (bearer + PoP tabs)
docs/                      # guides, specs, security model, brand
```

## Development

```bash
npm install
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=cookey postgres:16
cp apps/proxy/.env.example apps/proxy/.env   # fill in DATABASE_URL etc.
npm run db:migrate
npm run dev:proxy        # gateway on :3000
npm test                 # vitest (unit + DB integration)
```

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
