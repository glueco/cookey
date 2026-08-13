# Contributing

Cookey is a self-hosted personal API gateway: owners store their API keys
once and grant apps controlled, revocable access. Contributions welcome.

## Where things go

- **New provider integration?** You almost certainly want the
  [connector marketplace repo](https://github.com/glueco/connectors), not
  this one. Connectors are pure JSON — no code, no redeploys. Only a genuinely
  new *wire protocol* justifies a new adapter here
  (`apps/proxy/src/server/adapters/`), and there should stay ~5 of them.
- Gateway (Next.js + Prisma/Postgres): `apps/proxy/`
- PoP SDKs: `packages/sdk` (TS, zero deps) and `sdks/python/`
- Docs: `docs/` — specs are normative; update them with behavior changes.

## Development setup

```bash
git clone https://github.com/glueco/cookey.git
cd cookey && npm install
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=cookey postgres:16
cp apps/proxy/.env.example apps/proxy/.env   # set DATABASE_URL, MASTER_KEY, ADMIN_SECRET
npm run db:migrate
npm run dev:proxy                            # http://localhost:3000
```

## Ground rules

- `npm run build` and `npm test` must be green. Tests accompany code —
  every security-relevant change needs at least one test.
- **Wire compatibility is sacred**: PoP v1 canonical signing
  (`sdks/test-vectors.json` is the contract), `/r/...` URL shapes,
  `/api/connect/*` request/response shapes, `/api/resources` (additive only).
- Migrations are additive-first and must run on a live database.
- Never log or echo secrets — provider keys, `ck_` tokens, claim/pairing
  codes. The logger redaction test enforces this; keep it passing.
- Keep files under ~400 lines; extract components/modules instead.

## Releases

`@glueco/sdk` publishes to npm via changesets: add a changeset with your PR,
and merging the bot's "Version Packages" PR publishes. `glueco-sdk` (Python)
is published to PyPI manually from `sdks/python/` — bump `pyproject.toml`
and `CHANGELOG.md` in the same PR as the change. The gateway ships by
deployment; the marketplace ships by merge.
