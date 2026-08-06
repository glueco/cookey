# Contributing to Glueco Gateway

Thanks for your interest in contributing! Glueco Gateway is a BYOK (Bring-Your-Own-Key) proxy that focuses on secure, deploy-your-own usage with PoP signing, plugin-based integrations, and minimal operational overhead.

Even small contributions (docs, tests, examples) are very welcome.

---

## Repository Structure

```

apps/
proxy/                 # Next.js gateway (API + admin routes)
packages/
sdk/                   # Client SDK
plugin-*/              # Resource / provider plugins
examples/
demo-target-app/       # Example app showing pairing & server-side usage
docs/                    # Documentation
proxy.plugins.ts         # Enable / disable plugins

````

---

## Prerequisites

- Node.js (same version as CI / repo config)
- npm
- Postgres database (local or hosted, e.g. Neon)
- Redis (local or hosted, e.g. Upstash)

---

## Local Development (Gateway)

```bash
# Clone
git clone https://github.com/glueco/cookey.git
cd gateway

# Install dependencies
npm install

# Setup environment for proxy
cd apps/proxy
cp .env.example .env

# Configure DATABASE_URL and REDIS_URL in .env

# Run migrations
npx prisma migrate dev

# Start dev server
cd ../..
npm run dev
````

The gateway should now be running locally.

---

## Enabling / Disabling Plugins

Plugins are controlled via `proxy.plugins.ts` at the repo root.

Example:

```ts
export default {
  "llm:openai": true,
  "llm:groq": true,
  "llm:gemini": true,
  "mail:resend": true,
};
```

If a plugin is disabled here, it will not be exposed by the proxy.

---

## Adding a New Plugin

Recommended contribution path.

A plugin should:

* Live under `packages/plugin-<category>-<name>/`
* Define a unique `resourceId` (e.g. `llm:anthropic`)
* Expose:

  * Server / proxy handler
  * Client-side SDK entry (types + helpers)
* Validate inputs using schemas
* Avoid requiring real API keys in tests

Also include:

* Minimal documentation (how to enable, required env vars)
* One example request

---

## Running Checks

Before opening a PR, run what’s available:

```bash
npm run lint
npm run build
npm run test
```

If a command does not exist yet, scoped PRs that add it are welcome.

---

## Documentation Contributions

Docs live under `docs/` and the main `README.md`.

Good doc contributions include:

* Quick start verification
* Setup troubleshooting
* Plugin usage examples
* Architecture explanations

Docs-only PRs are perfectly acceptable.

---

## Commit & PR Guidelines

* Keep PRs small and focused
* One concern per PR (docs, tests, plugin, fix)
* Clearly explain:

  * What changed
  * Why it changed
  * How it was tested

If the repo uses Changesets and your PR affects public APIs, add a changeset.

---

## PR Checklist

* [ ] I ran local checks (where applicable)
* [ ] I updated docs if behavior changed
* [ ] I did not include real API keys or secrets
* [ ] I added tests for non-trivial logic (when practical)

---

## Security

If you discover a security issue:

* Do **not** open a public issue
* Follow the security reporting instructions in the README

---

Thanks for helping improve Glueco Gateway 🚀
Feedback and suggestions are always welcome.
