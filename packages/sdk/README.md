# @glueco/sdk

Client SDK for the [Glueco Gateway](https://github.com/glueco/gateway). Provides PoP (Proof-of-Possession) authentication via Ed25519 signatures for secure, keyless API access.

## Installation

```bash
npm install @glueco/sdk
```

## Key Features

- **Env-Only Keys**: Private key loaded from `GLUECO_PRIVATE_KEY` environment variable — never stored in files or passed through code
- **Server-Side Only**: Key operations throw if run in the browser, preventing accidental key leakage
- **PoP Authentication**: Ed25519-based request signing with timestamp, nonce, and body hash
- **Transport Interface**: Clean `GatewayTransport` abstraction for typed plugin clients
- **OpenAI Compatibility**: Works with the official OpenAI SDK via custom `fetch`

## Quick Start

### 1. Generate a Key

```bash
# One-time key generation
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Set in environment
export GLUECO_PRIVATE_KEY="your-base64-key-here"
```

### 2. Connect to Gateway

```typescript
import { connect, handleCallback } from "@glueco/sdk";

// Initiate connection (server-side — uses GLUECO_PRIVATE_KEY)
const result = await connect({
  pairingString: "pair::https://gateway.example.com::abc123...",
  app: {
    name: "My App",
    description: "Example application",
  },
  requestedPermissions: [
    { resourceId: "llm:groq", actions: ["chat.completions"] },
    { resourceId: "llm:anthropic", actions: ["chat.completions"] },
  ],
  redirectUri: "https://myapp.com/callback",
});

// Redirect user to approval URL
console.log("Redirect to:", result.approvalUrl);
```

### 3. Handle Callback

```typescript
// After user approves, they're redirected back with query params
const params = new URLSearchParams(window.location.search);
const result = handleCallback(params);

if (result.approved) {
  console.log("Connected! App ID:", result.appId);
  // Store appId for future requests
}
```

### 4. Create Transport & Make Requests

```typescript
import { createTransport } from "@glueco/sdk";
import { groq } from "@glueco/plugin-llm-groq/client";
import { anthropic } from "@glueco/plugin-llm-anthropic/client";

// Create transport (uses GLUECO_PRIVATE_KEY from env)
const transport = createTransport({
  proxyUrl: "https://gateway.example.com",
  appId: "app_abc123", // From callback
});

// Typed Groq client
const groqClient = groq(transport);
const response = await groqClient.chatCompletions({
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "Hello!" }],
  temperature: 0.7,
});

console.log(response.data.choices[0].message.content);

// Typed Anthropic client
const claudeClient = anthropic(transport);
const response2 = await claudeClient.chatCompletions({
  model: "claude-3-5-sonnet-20241022",
  messages: [{ role: "user", content: "Hello!" }],
});

// Streaming
const stream = await groqClient.chatCompletionsStream({
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "Tell me a story" }],
});
```

### 5. Use with OpenAI SDK

```typescript
import OpenAI from "openai";
import { createGatewayFetchFromEnv } from "@glueco/sdk";

const gatewayFetch = createGatewayFetchFromEnv({
  appId: "app_abc123",
  proxyUrl: "https://gateway.example.com",
});

const openai = new OpenAI({
  apiKey: "unused", // Gateway handles auth
  baseURL: "https://gateway.example.com/r/llm/groq",
  fetch: gatewayFetch,
});

const completion = await openai.chat.completions.create({
  model: "llama-3.1-8b-instant",
  messages: [{ role: "user", content: "Hello!" }],
});
```

## API Reference

### `createTransport(options)` ⭐ Recommended

Creates a `GatewayTransport` with built-in PoP signing. Uses `GLUECO_PRIVATE_KEY` from environment.

```typescript
import { createTransport } from "@glueco/sdk";

const transport = createTransport({
  proxyUrl: "https://gateway.example.com",
  appId: "app_abc123",
  fetch?: typeof fetch,  // Custom fetch (optional)
});
```

### GatewayTransport

The transport interface for making typed requests through the gateway:

```typescript
interface GatewayTransport {
  request<TResponse, TRequest>(
    pluginId: string,    // "llm:groq"
    action: string,      // "chat.completions"
    body: TRequest,
    options?: GatewayRequestOptions,
  ): Promise<GatewayResponse<TResponse>>;

  requestStream(
    pluginId: string,
    action: string,
    body: unknown,
    options?: GatewayRequestOptions,
  ): Promise<GatewayStreamResponse>;
}

interface GatewayResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

interface GatewayStreamResponse {
  stream: ReadableStream<Uint8Array>;
  status: number;
  headers: Headers;
}
```

### `createGatewayFetchFromEnv(options)`

Low-level PoP-enabled fetch function. Uses `GLUECO_PRIVATE_KEY` from environment.

```typescript
import { createGatewayFetchFromEnv } from "@glueco/sdk";

const gatewayFetch = createGatewayFetchFromEnv({
  appId: "app_abc123",
  proxyUrl: "https://gateway.example.com",
});

// Use like regular fetch — PoP headers added automatically
const response = await gatewayFetch("/r/llm/groq/v1/chat/completions", {
  method: "POST",
  body: JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: "Hello!" }],
  }),
});
```

### Key Utilities

```typescript
import {
  loadSeedFromEnv,    // Load 32-byte seed from GLUECO_PRIVATE_KEY
  publicKeyFromSeed,  // Derive base64 public key from seed
  signWithSeed,       // Sign bytes with seed → Uint8Array
  signToBase64Url,    // Sign bytes with seed → base64url string
  verify,             // Verify signature against public key
  generateNonce,      // Generate cryptographic nonce
  KeyError,           // Error class for key issues
} from "@glueco/sdk";
```

### GatewayClient (Legacy)

> **Note:** `GatewayClient` is maintained for backward compatibility but `createTransport()` is the recommended API.

```typescript
import { GatewayClient, MemoryConfigStorage } from "@glueco/sdk";

const client = new GatewayClient({
  configStorage?: ConfigStorage,  // Default: MemoryConfigStorage
  fetch?: typeof fetch,           // Custom fetch
  throwOnError?: boolean,         // Default: false
});

await client.isConnected(): Promise<boolean>
await client.connect(options): Promise<ConnectResult>
await client.handleCallback(params): Promise<{ approved: boolean; appId?: string }>
await client.getFetch(): Promise<GatewayFetch>
await client.getTransport(): Promise<GatewayTransport>
await client.disconnect(): Promise<void>
```

## URL Patterns

The gateway uses explicit URL-based resource routing:

```
/r/<resourceType>/<provider>/v1/chat/completions
```

Examples:

- `/r/llm/groq/v1/chat/completions` — Groq chat
- `/r/llm/anthropic/v1/chat/completions` — Anthropic Claude (translated to Messages API)
- `/r/llm/gemini/v1/chat/completions` — Google Gemini
- `/r/llm/openai/v1/chat/completions` — OpenAI chat
- `/r/mail/resend/v1/emails` — Resend email

## Environment Variables

```env
# Required — 32-byte Ed25519 seed, base64-encoded (SERVER-SIDE ONLY)
GLUECO_PRIVATE_KEY=base64...

# App identity (from gateway callback)
GATEWAY_APP_ID=app_abc123
GATEWAY_PROXY_URL=https://gateway.example.com
```

## Security Notes

- `GLUECO_PRIVATE_KEY` must **never** be exposed to the browser
- The SDK throws `KeyError` if it detects a browser environment (`window` is defined)
- For web apps, use a server-side API route pattern — see the demo app for examples
- Keys are Ed25519 seeds (32 bytes), not full keypairs

## License

MIT
