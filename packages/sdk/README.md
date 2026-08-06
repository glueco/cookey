# @glueco/sdk

**You probably don't need this package.** Cookey's default connection path is a
static bearer token (`ck_…`) that works with any HTTP client or an unmodified
OpenAI SDK — zero code changes, zero dependencies:

```python
from openai import OpenAI
client = OpenAI(base_url="https://your-gateway/r/llm/groq/v1", api_key=os.environ["COOKEY_TOKEN"])
```

This SDK exists **only** for PoP (proof-of-possession) auth on long-lived
grants, where an Ed25519 keypair keeps the credential out of every request
and log.

Zero runtime dependencies — signing uses WebCrypto (Node ≥18 / modern browsers).

## PoP quickstart

```ts
import { generateKeyPair, submitGrant, createTransport } from "@glueco/sdk";

// One-time: generate a keypair, store seedBase64 as GLUECO_PRIVATE_KEY
const { seedBase64, publicKeyBase64 } = await generateKeyPair();

// Submit a grant document with a pairing string from the gateway owner
const { approvalUrl } = await submitGrant({
  pairingString: "pair::https://gateway.example.com::abc123…",
  grant: {
    specVersion: "1",
    app: { name: "My App" },
    runtime: "server",
    auth: "pop",
    requests: [
      { resource: "llm:*", actions: ["chat.completions"], reason: "Core chat features." },
    ],
    duration: "90d",
  },
});
// → owner approves at approvalUrl

// After approval: signed requests
const transport = createTransport({
  proxyUrl: "https://gateway.example.com",
  appId: "<from the callback or /api/connect/status>",
});
const res = await transport.request("llm:groq", "chat.completions", {
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "Hi" }],
});
```

Or plug the signing fetch into a vendor SDK:

```ts
import OpenAI from "openai";
import { createGatewayFetch } from "@glueco/sdk";

const client = new OpenAI({
  apiKey: "unused",
  baseURL: "https://gateway.example.com/r/llm/groq/v1",
  fetch: createGatewayFetch({ appId, proxyUrl: "https://gateway.example.com" }),
});
```

## Wire protocol

The PoP v1 canonical request format is documented in the gateway repo's
`docs/POP_PROTOCOL.md`; cross-language test vectors live in
`sdks/test-vectors.json`.
