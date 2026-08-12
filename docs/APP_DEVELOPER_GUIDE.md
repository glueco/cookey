# App Developer Guide

Your users own Cookey gateways. Instead of asking them to paste an API key,
you ask their gateway for a **grant** — and get back a token that works with
the HTTP client you already use. **You do not need an SDK.**

## 1. Write your grant document

A grant document says what your app needs and why. Build one interactively at
`https://<any-gateway>/builder`, or by hand:

```json
{
  "specVersion": "1",
  "app": {
    "name": "Outsmart",
    "description": "LLM social-deduction game — models negotiate and vote each round.",
    "homepage": "https://outsmart.example.app"
  },
  "runtime": "server",
  "auth": "bearer",
  "requests": [
    {
      "resource": "llm:*",
      "actions": ["chat.completions"],
      "reason": "Runs the four AI players each game round.",
      "constraints": { "maxOutputTokens": 1024 }
    },
    {
      "resource": "mail:resend",
      "actions": ["send"],
      "reason": "Emails the game summary to the player.",
      "constraints": { "maxRecipients": 1 }
    }
  ],
  "options": [
    {
      "id": "game-only",
      "name": "Game only",
      "description": "Just the AI players — no email access.",
      "recommended": true,
      "requests": [0],
      "budget": { "dailyRequests": 100 }
    },
    {
      "id": "full",
      "name": "Game + email summaries",
      "requests": [0, 1],
      "budget": { "dailyRequests": 200 }
    }
  ],
  "duration": "30d",
  "renewal": { "period": "30d" },
  "budget": { "dailyRequests": 200, "dailyTokens": 100000 },
  "redirectUri": "https://outsmart.example.app/callback"
}
```

Notes that matter:

- **`requests` is the ask.** It's what the approval screen opens on and
  what the owner approves unless they narrow it. Nothing else has to be
  filled in for consent to work.
- **`options` is optional (0–5 entries)** and only worth shipping if your
  app has real tiers. Each one is a *smaller* bundle the owner may take
  instead; accepting one materializes only that option's requests. If
  your app has a single shape, omit `options` entirely — the example
  above ships them because email access is genuinely separable from the
  game. Offering a trimmed tier makes owners more likely to say yes; a
  single all-inclusive option just adds a click.
- **`auth` + `publicKey` decide your credential, not the owner.** Ship a
  public key and sign your requests to get PoP; otherwise you get a
  static bearer token, and the owner's screen warns them about it
  accordingly. There is no approval-time override in either direction.
- **`reason` is required per request** and shown to the owner verbatim. Write
  it for a human deciding whether to trust you.
- `resource` may be concrete (`llm:groq`) or a wildcard (`llm:*`) — the owner
  binds wildcards to whatever providers they have.
- Ask for realistic `budget` ceilings. Owners can only tighten; asking for
  the moon reads badly on the approval screen.
- Full field reference: [GRANT_SPEC.md](GRANT_SPEC.md).

## 2. Get it to the gateway (pick one)

**a. Well-known discovery (preferred for hosted apps).** Serve the document
at `/.well-known/cookey-grant.json`. Owners add your app by pasting your URL.

**b. Pairing code.** The owner generates a `pair::<gateway>::<code>` string
in their dashboard; your app submits:

```
POST {gateway}/api/connect/prepare
{ "connectCode": "<code>", "grant": { …document… } }
→ { "grantId", "approvalUrl", "expiresAt" }
```

Show `approvalUrl` to the owner, then poll
`GET {gateway}/api/connect/status?session={grantId}` for
`pending | approved | rejected`.

(There is no manual-paste path — grants only enter a gateway through
these app-initiated routes.)

## 3. Receive your token

- **`redirectUri` set**: on approval the owner's browser is redirected to
  `{redirectUri}?code=…&gateway=…`. Exchange once:

  ```
  POST {gateway}/v1/token/claim   { "code": "…" }
  → { "token": "ck_…", "grantId", "expiresAt" }
  ```

  Codes are single-use with a 10-minute TTL; a second exchange returns 410
  and notifies the owner.

- **No redirect (CLI, Streamlit, notebooks)**: the owner copies the token
  from the approval screen into your app's config/secrets.

## 4. Use it — with whatever you already have

The token is a standard bearer credential and the data plane speaks the
OpenAI wire format for every LLM provider:

```python
# Python — the unmodified openai client
from openai import OpenAI
client = OpenAI(
    base_url=f"{gateway}/r/llm/groq/v1",
    api_key=os.environ["COOKEY_TOKEN"],
)
```

```bash
# curl
curl $GATEWAY/r/llm/groq/v1/chat/completions \
  -H "Authorization: Bearer $COOKEY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "llama-3.3-70b-versatile", "messages": [{"role":"user","content":"Hi"}]}'
```

```js
// JavaScript — fetch
await fetch(`${gateway}/r/llm/groq/v1/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model, messages }),
});
```

Streaming (`"stream": true`) works everywhere, including providers the
gateway translates (Anthropic, Gemini).

### Discover what you actually got

```
GET {gateway}/v1/grant     (Authorization: Bearer ck_…)
```

returns your bound resources, the exact model lists, constraints, and
remaining budgets — build your model picker from this instead of guessing.

## 5. Rules your app lives under

- Requests are checked against the owner's budgets and constraints; over-cap
  returns 429, disallowed models 403. `max_tokens` above the cap is silently
  clamped.
- **Browser calls are blocked by default** — route through your backend. If
  your app genuinely runs in the browser, declare `"runtime": "browser"` and
  say so; the owner must explicitly allow it.
- Grants expire and renewable grants lapse unless the owner renews. Handle
  401/403 by prompting the user to reconnect, not by retrying forever.

## 6. PoP for long-lived grants (the only reason an SDK exists)

Static tokens are fine for short-lived or renewable grants. For long-lived
access, PoP keeps the credential out of every request: your app holds an
Ed25519 seed and signs each request; the gateway stores only the public key.

```ts
import { generateKeyPair, submitGrant, createTransport } from "@glueco/sdk";

const { seedBase64 } = await generateKeyPair();   // store as GLUECO_PRIVATE_KEY
const { approvalUrl } = await submitGrant({
  pairingString,
  grant: { …document, auth: "pop" },              // publicKey auto-filled
});
// after approval:
const transport = createTransport({ proxyUrl: gateway, appId });
await transport.request("llm:groq", "chat.completions", { model, messages });
```

Python: `pip install glueco-sdk` (same protocol; see `sdks/python/`).
Wire details: [POP_PROTOCOL.md](POP_PROTOCOL.md).
