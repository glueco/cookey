# Glueco Gateway

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node Version">
</p>

<p align="center">
  <strong>🔐 Safely share your API keys with applications — without ever exposing them.</strong>
</p>

<p align="center">
  <a href="#the-problem">The Problem</a> •
  <a href="#the-solution">The Solution</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#demo">Try Demo</a> •
  <a href="./docs/ADMIN_GUIDE.md">Deploy Guide</a>
</p>

---

## The Problem

**AI apps are cheap to build, expensive to run.**

It's easy to ship an AI feature. It's hard to ship an AI _product_.

If your app calls OpenAI, Groq, Gemini, Resend ( mailing service), or any other resource provider, _someone_ must provide paid API keys. That creates a brutal tradeoff:

### Option 1: Use Your Own Keys

You become the payer. Every user request costs you money. Open-source projects and indie apps can't sustainably subsidize usage.

### Option 2: Ask Users for Their Keys

Users must trust you with their secrets. Keys can be leaked, abused, overused, or copied. Users get no spend caps, no visibility, and no reliable kill-switch.

---

This is why many promising AI tools either:

- 💳 Hide behind subscriptions (pricing you out of experimentation)
- 🙏 Ask you to paste an API key and "trust us"

---

## The Solution

**Glueco replaces "trust us with your key" with "connect your key safely."**

Your Gateway acts as a **secure proxy** between applications and your API providers. You store your API keys once, then grant apps **controlled, time-limited access** through the gateway.

```
┌─────────────┐        ┌─────────────────┐        ┌─────────────────┐
│   Your App  │ ──────▶│  Your Gateway   │ ──────▶│  OpenAI/Groq/   │
│             │◀────── │  (with your     │◀────── │  Gemini/etc     │
│  (no keys)  │        │   API keys)     │        │                 │
└─────────────┘        └─────────────────┘        └─────────────────┘
```

### What You Get

- 🔐 **Your keys stay yours** — Apps never see or touch your API keys
- ⏱️ **Time-limited access** — Permissions auto-expire (1 hour, 1 day, 1 week...)
- 💸 **Spend control** — Rate limits, quotas, and token budgets per app
- 📊 **Full visibility** — See exactly how each app uses your resources
- ⚡ **Instant revoke** — Kill access anytime with one click

---

## Features

### �️ Cryptographic Authentication

PoP (Proof-of-Possession) ensures only authorized apps can make requests. No shared secrets, no leaked tokens.

### 🎛️ Fine-Grained Control

- **Model restrictions** — Allow only specific AI models
- **Rate limits** — Requests per minute/hour
- **Quotas** — Daily/monthly request caps
- **Token budgets** — Limit LLM token usage

### 🔌 Multi-Provider Support

One gateway, many providers:

- **LLM**: OpenAI, Groq, Google Gemini, Anthropic Claude
- **Email**: Resend
- **Extensible**: Custom plugins easy to create

---

## How It Works

### 1. Deploy Your Gateway

One-click deploy to Vercel with Neon (PostgreSQL) and Upstash (Redis).

### 2. Add Your API Keys

Securely store keys for OpenAI, Groq, Gemini, Resend, etc.

### 3. Generate Pairing Strings

Create one-time pairing strings (valid 10 minutes) for apps you want to connect.

### 4. Approve Access Requests

When an app connects, review and approve what resources it can access, for how long, with what limits.

### 5. Monitor Usage

Watch real-time usage stats. Revoke access anytime.

---

## Quick Start

### Deploy to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/glueco/gateway)

See the [Admin Deployment Guide](./docs/ADMIN_GUIDE.md) for detailed setup instructions.

### Local Development

```bash
# Clone repository
git clone https://github.com/glueco/gateway.git
cd gateway

# Install dependencies
npm install

# Set up environment (copy and edit .env)
cd apps/proxy
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

---

## Demo

Try the gateway with our demo application:

🔗 **Demo App**: [downstatus.vercel.app](https://downstatus.vercel.app)

The demo app demonstrates:

- Connecting to a gateway using pairing strings
- Making authenticated API requests
- Testing LLM endpoints through the proxy

---

## For App Developers

### Using the SDK

Install the SDK in your application:

```bash
npm install @glueco/sdk
```

Set your private key as an environment variable (server-side only):

```bash
# Generate a key (one-time)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Set in environment
export GLUECO_PRIVATE_KEY="your-base64-key-here"
```

Create a transport and make requests:

```typescript
import { createTransport } from "@glueco/sdk";
import { groq } from "@glueco/plugin-llm-groq/client";

// Create transport (uses GLUECO_PRIVATE_KEY from env)
const transport = createTransport({
  proxyUrl: "https://gateway.example.com",
  appId: "app_abc123", // From callback after approval
});

// Use typed plugin client (keys are NEVER in your app)
const groqClient = groq(transport);
const response = await groqClient.chatCompletions({
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.data.choices[0].message.content);
```

> **Note:** `GLUECO_PRIVATE_KEY` must be kept server-side only. For web applications, use a server-side pattern where private keys stay on your server. The demo app shows this approach with API routes that handle PoP signing.

### Using with OpenAI SDK

The gateway is OpenAI-compatible, so you can use the official OpenAI SDK:

```typescript
import OpenAI from "openai";
import { createTransport } from "@glueco/sdk";

const transport = createTransport({
  proxyUrl: "https://gateway.example.com",
  appId: "app_abc123",
});

const openai = new OpenAI({
  apiKey: "unused", // The gateway handles auth
  baseURL: `${transport.getProxyUrl()}/r/llm/groq`,
  fetch: transport.getFetch(),
});

const completion = await openai.chat.completions.create({
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "Hello!" }],
});
```

---

## Supported Resources

| Resource ID      | Provider  | Description           |
| ---------------- | --------- | --------------------- |
| `llm:openai`     | OpenAI    | GPT-4, GPT-3.5       |
| `llm:groq`       | Groq      | Llama 3.x, Mixtral    |
| `llm:gemini`     | Google    | Gemini 2.5/3.0        |
| `llm:anthropic`  | Anthropic | Claude 3.5, Claude 3  |
| `mail:resend`    | Resend    | Transactional email   |

---

## Documentation

| Document                                             | Description                    |
| ---------------------------------------------------- | ------------------------------ |
| [Admin Guide](./docs/ADMIN_GUIDE.md)                 | Deploy and manage your gateway |
| [Developer Guide](./docs/DEVELOPER_GUIDE.md)         | Build apps with the SDK        |
| [Adding Plugins](./docs/ADDING_PLUGINS.md)           | Enable resource plugins        |
| [Plugin Development](./docs/PACKAGE_ARCHITECTURE.md) | Create custom plugins          |
| [API Reference](./docs/API_REFERENCE.md)             | Gateway API endpoints          |

---

## Plugin Architecture

Glueco Gateway uses a **plug-and-play plugin system**. Each provider (OpenAI, Groq, Gemini, Resend) is a self-contained plugin package that can be enabled or disabled independently.

### How Plugins Work

- **Modular by design** — Add or remove providers without touching core gateway code
- **Dual-entrypoint** — Each plugin has `/proxy` (server-side) and `/client` (SDK) exports
- **Schema-first enforcement** — Plugins define validation and policy rules declaratively
- **Easy to extend** — Create custom plugins for any API using the template

### Enabling Plugins

Edit `proxy.plugins.ts` at the root:

```typescript
const enabledPlugins = [
  "@glueco/plugin-llm-groq",
  "@glueco/plugin-llm-openai",
  "@glueco/plugin-llm-gemini",
  "@glueco/plugin-llm-anthropic",
  "@glueco/plugin-mail-resend",
];
```

→ See [Package Architecture](./docs/PACKAGE_ARCHITECTURE.md) for creating custom plugins.

---

## Project Structure

```
├── apps/proxy/           # Next.js gateway application
├── packages/
│   ├── sdk/              # Client SDK for apps
│   ├── shared/           # Shared types and contracts
│   ├── plugin-llm-*/     # LLM provider plugins
│   └── plugin-mail-*/    # Email provider plugins
├── examples/
│   └── demo-target-app/  # Demo application
└── docs/                 # Documentation
```

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## Security

Found a vulnerability? Please report it privately to dev.umernisar@gmail.com .

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built with ❤️ for developers who value security and control.
</p>
