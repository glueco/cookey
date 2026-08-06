# Developer Guide

This guide is for application developers who want to integrate with a Personal Resource Gateway.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Connection Flow](#connection-flow)
5. [Making Requests](#making-requests)
6. [Using Plugin Clients](#using-plugin-clients)
7. [OpenAI SDK Integration](#openai-sdk-integration)
8. [Error Handling](#error-handling)
9. [Storage Options](#storage-options)
10. [Best Practices](#best-practices)

---

## Overview

The Personal Resource Gateway SDK allows your application to securely access API resources (like LLMs, email services) through a user's gateway without ever handling their API keys.

**Benefits for your app:**

- No API key management - users provide their own keys via their gateway
- Instant access to multiple providers through one integration
- Built-in authentication handling
- TypeScript support with full type definitions

---

## Installation

```bash
# npm
npm install @glueco/sdk

# pnpm
pnpm add @glueco/sdk

# yarn
yarn add @glueco/sdk
```

---

## Quick Start

```typescript
import { GatewayClient, FileKeyStorage, FileConfigStorage } from "@glueco/sdk";

// 1. Create client with storage
const client = new GatewayClient({
  keyStorage: new FileKeyStorage("./.gateway/keys.json"),
  configStorage: new FileConfigStorage("./.gateway/config.json"),
});

// 2. Check if already connected
if (await client.isConnected()) {
  console.log("Already connected to gateway");
} else {
  // 3. Get pairing string from user
  const pairingString = prompt("Enter pairing string from gateway:");

  // 4. Connect and request permissions
  await client.connect(pairingString, {
    app: {
      name: "My App",
      description: "An AI-powered tool",
      homepage: "https://myapp.com",
    },
    permissions: [{ resourceId: "llm:groq", actions: ["chat.completions"] }],
    duration: { type: "preset", preset: "1_hour" },
  });
}

// 5. Make authenticated requests
const transport = await client.getTransport();
const response = await transport.fetch("/r/llm/groq/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: "Hello!" }],
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

---

## Connection Flow

### Step 1: User Generates Pairing String

The user logs into their gateway admin dashboard and generates a one-time pairing string. This string:

- Is valid for 10 minutes
- Can only be used once
- Contains the gateway URL encoded within it

### Step 2: App Initiates Connection

```typescript
const { approvalUrl } = await client.connect(pairingString, {
  app: {
    name: "My App",
    description: "Description shown to user",
    homepage: "https://myapp.com",
  },
  permissions: [
    { resourceId: "llm:groq", actions: ["chat.completions"] },
    { resourceId: "llm:openai", actions: ["chat.completions"] },
    { resourceId: "mail:resend", actions: ["emails.send"] },
  ],
  duration: { type: "preset", preset: "24_hours" },
});

// Direct user to approval URL (or handle automatically)
console.log("Approve access at:", approvalUrl);
```

### Step 3: User Approves Request

The user is directed to an approval page on their gateway where they can:

- Review what resources are requested
- Customize duration (e.g., shorter than requested)
- Restrict to specific models
- Set rate limits and quotas

### Step 4: App Receives Credentials

Once approved, the app receives:

- An App ID (unique identifier)
- Cryptographic keys for authentication
- Resource access information

These are automatically stored by the `keyStorage` you provided.

### Alternative: Same-Tab Approval Flow

For web apps that prefer same-tab navigation (no popup):

```typescript
// 1. Store pending session before redirect
localStorage.setItem("pending_session", JSON.stringify({
  sessionToken: result.sessionToken,
  gatewayUrl: result.gatewayUrl,
}));

// 2. Redirect to approval (same tab)
window.location.href = result.approvalUrl;

// 3. On return from approval, check URL params
const params = new URLSearchParams(window.location.search);
if (params.get("status") === "approved") {
  const pending = JSON.parse(localStorage.getItem("pending_session"));
  // Complete connection via status endpoint
  const status = await fetch(`/api/connect/status?session=${pending.sessionToken}`);
  // ...
}
```

---

## Making Requests

### Using Transport

The transport handles authentication automatically:

```typescript
const transport = await client.getTransport();

// Direct fetch
const response = await transport.fetch("/r/llm/groq/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: "Explain quantum computing" }],
  }),
});
```

### Resource URL Format

Resources follow this URL pattern:

```
/r/<resourceType>/<provider>/<api-path>
```

Examples:

- `/r/llm/groq/v1/chat/completions` - Groq chat
- `/r/llm/openai/v1/chat/completions` - OpenAI chat
- `/r/llm/gemini/v1/chat/completions` - Gemini chat
- `/r/mail/resend/emails/send` - Send email via Resend

---

## Using Plugin Clients

For type-safe requests, use plugin clients:

```typescript
import { groq } from "@glueco/plugin-llm-groq/client";
import { openai } from "@glueco/plugin-llm-openai/client";
import { resend } from "@glueco/plugin-mail-resend/client";

const transport = await client.getTransport();

// Groq with full type safety
const groqClient = groq(transport);
const groqResponse = await groqClient.chatCompletions({
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "Hello!" }],
  max_tokens: 1000,
});

// OpenAI
const openaiClient = openai(transport);
const openaiResponse = await openaiClient.chatCompletions({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});

// Resend Email
const mailClient = resend(transport);
const emailResponse = await mailClient.emails.send({
  from: "notifications@myapp.com",
  to: "user@example.com",
  subject: "Welcome!",
  html: "<h1>Welcome to our app!</h1>",
});
```

---

## OpenAI SDK Integration

Use the official OpenAI SDK with any gateway provider:

```typescript
import OpenAI from "openai";

const client = new GatewayClient({ ... });
const gatewayFetch = await client.getFetch();

// Use Groq through OpenAI SDK
const groqViaOpenAI = new OpenAI({
  apiKey: "unused", // Gateway handles auth
  baseURL: await client.getResourceBaseUrl("llm", "groq"),
  fetch: gatewayFetch,
});

const response = await groqViaOpenAI.chat.completions.create({
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "Hello!" }],
});

// Same code works for OpenAI
const openai = new OpenAI({
  apiKey: "unused",
  baseURL: await client.getResourceBaseUrl("llm", "openai"),
  fetch: gatewayFetch,
});
```

---

## Error Handling

The gateway returns standardized error responses:

```typescript
try {
  const response = await transport.fetch("/r/llm/groq/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      /* ... */
    }),
  });

  if (!response.ok) {
    const error = await response.json();

    switch (response.status) {
      case 401:
        // Not authenticated - reconnect needed
        console.log("Session expired, reconnect needed");
        break;
      case 403:
        // Permission denied
        console.log("Permission denied:", error.message);
        // Possible reasons: model not allowed, expired, quota exceeded
        break;
      case 422:
        // Validation error
        console.log("Invalid request:", error.message);
        break;
      case 429:
        // Rate limited
        console.log("Rate limited, retry after:", error.retryAfter);
        break;
    }
  }
} catch (err) {
  // Network error
  console.error("Network error:", err);
}
```

### Error Codes

| Code                     | Status | Description               |
| ------------------------ | ------ | ------------------------- |
| `EXPIRED`                | 403    | Permission has expired    |
| `NOT_YET_VALID`          | 403    | Permission not active yet |
| `MODEL_NOT_ALLOWED`      | 403    | Model not in allowed list |
| `RATE_LIMIT_EXCEEDED`    | 429    | Too many requests         |
| `DAILY_QUOTA_EXCEEDED`   | 403    | Daily request limit hit   |
| `MONTHLY_QUOTA_EXCEEDED` | 403    | Monthly request limit hit |
| `TOKEN_BUDGET_EXCEEDED`  | 403    | Token limit hit           |

---

## Storage Options

### FileKeyStorage (Default)

Stores credentials in a JSON file:

```typescript
const keyStorage = new FileKeyStorage("./.gateway/keys.json");
```

### MemoryKeyStorage

For serverless or ephemeral environments:

```typescript
const keyStorage = new MemoryKeyStorage();

// Manual save/load
const state = keyStorage.export();
localStorage.setItem("gateway", JSON.stringify(state));

// Restore
const saved = JSON.parse(localStorage.getItem("gateway"));
keyStorage.import(saved);
```

### Custom Storage

Implement your own for databases, etc:

```typescript
class DatabaseKeyStorage implements KeyStorage {
  async getKeys(): Promise<GatewayKeys | null> {
    return await db.query("SELECT keys FROM gateway_config");
  }

  async saveKeys(keys: GatewayKeys): Promise<void> {
    await db.query("INSERT INTO gateway_config (keys) VALUES ($1)", [keys]);
  }

  async clearKeys(): Promise<void> {
    await db.query("DELETE FROM gateway_config");
  }
}
```

---

## Duration Presets

When requesting access, specify duration:

```typescript
// Using presets
duration: { type: "preset", preset: "1_hour" }
duration: { type: "preset", preset: "4_hours" }
duration: { type: "preset", preset: "24_hours" }
duration: { type: "preset", preset: "1_week" }
duration: { type: "preset", preset: "1_month" }
duration: { type: "preset", preset: "forever" }

// Using exact time
duration: { type: "until", expiresAt: "2024-12-31T23:59:59Z" }
```

**Note:** Gateway admins can grant less than requested, never more.

---

## Best Practices

### 1. Handle Reconnection

Credentials can expire. Handle gracefully:

```typescript
async function ensureConnected(client: GatewayClient) {
  if (await client.isConnected()) {
    // Verify still valid
    try {
      await client.getTransport();
      return true;
    } catch {
      // Invalid, need to reconnect
    }
  }
  return false;
}
```

### 2. Request Minimal Permissions

Only request the resources and actions you actually need:

```typescript
// Good - specific
permissions: [{ resourceId: "llm:groq", actions: ["chat.completions"] }];

// Avoid - overly broad
permissions: [
  { resourceId: "llm:groq", actions: ["*"] },
  { resourceId: "llm:openai", actions: ["*"] },
  { resourceId: "llm:gemini", actions: ["*"] },
];
```

### 3. Handle Rate Limits

Implement exponential backoff:

```typescript
async function requestWithRetry(fn: () => Promise<Response>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fn();

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("retry-after") || "1");
      await sleep(retryAfter * 1000 * (i + 1));
      continue;
    }

    return response;
  }
  throw new Error("Max retries exceeded");
}
```

### 4. Cache Transport

Don't recreate transport on every request:

```typescript
let transport: GatewayTransport | null = null;

async function getOrCreateTransport() {
  if (!transport) {
    transport = await client.getTransport();
  }
  return transport;
}
```

---

## TypeScript Types

Full types are available:

```typescript
import type {
  GatewayClient,
  GatewayTransport,
  GatewayKeys,
  KeyStorage,
  ConfigStorage,
  ConnectOptions,
  PermissionRequest,
  RequestedDuration,
} from "@glueco/sdk";
```

---

## Support

- **Issues:** [GitHub Issues](https://github.com/glueco/cookey/issues)
- **Documentation:** [docs/](./docs/)
- **Demo App:** [demo-target-app](https://demo-target-app.vercel.app)
