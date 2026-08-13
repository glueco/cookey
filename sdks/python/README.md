# glueco-sdk (Python)

**You probably don't need this package.** Cookey's default connection path is a
static bearer token (`ck_…`) that works with any HTTP client or an unmodified
OpenAI client — zero code changes, zero dependencies:

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://your-gateway/r/llm/groq/v1",
    api_key=os.environ["COOKEY_TOKEN"],
)
```

This SDK exists **only** for PoP (proof-of-possession) auth on long-lived
grants, where an Ed25519 keypair keeps the credential out of every request
and log.

## Installation

```bash
pip install glueco-sdk
```

## Setup

Generate a private key (one-time) and set it server-side:

```bash
python -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
export GLUECO_PRIVATE_KEY="<the output>"
```

## PoP quickstart

```python
from glueco_sdk import submit_grant, create_transport

# 1. Submit a grant document (docs/GRANT_SPEC.md in the gateway repo) with a
#    pairing string from the gateway owner. The public key is derived from
#    GLUECO_PRIVATE_KEY automatically.
result = submit_grant(
    pairing_string="pair::https://gateway.example.com::abc123...",
    grant={
        "specVersion": "1",
        "app": {"name": "My App"},
        "runtime": "server",
        "auth": "pop",
        "requests": [
            {
                "resource": "llm:*",
                "actions": ["chat.completions"],
                "reason": "Core chat features.",
            },
        ],
        "duration": "90d",
    },
)

# 2. The owner approves at result["approval_url"]; poll
#    {proxy_url}/api/connect/status?session={grant_id} until "approved"
#    (the response carries your app_id).

# 3. Signed requests after approval
transport = create_transport(result["proxy_url"], app_id)
response = transport.request(
    "llm:groq",
    "chat.completions",
    {
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "user", "content": "Hi"}],
    },
)
```

Streaming uses `transport.request_stream(...)` and yields lines via
`iter_lines()`.

Persist only `{app_id, proxy_url}` — the private key stays in the
environment, and the SDK stores nothing.

## Error handling

```python
from glueco_sdk import GatewayError, ConnectError, KeyError

try:
    transport = create_transport(proxy_url, app_id)
except KeyError as e:
    print(f"Missing GLUECO_PRIVATE_KEY: {e}")

try:
    response = transport.request(...)
except GatewayError as e:
    print(f"Gateway error [{e.code}]: {e.message}")
```

## Wire protocol

The PoP v1 canonical request format is documented in the gateway repo's
`docs/POP_PROTOCOL.md`; cross-language test vectors live in
`sdks/test-vectors.json`. See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

MIT
