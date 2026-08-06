# Glueco SDK for Python

[![PyPI version](https://badge.fury.io/py/glueco-sdk.svg)](https://pypi.org/project/glueco-sdk/)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)

Minimal transport + signing layer for the [Glueco Gateway](https://github.com/glueco/gateway).

## Installation

```bash
pip install glueco-sdk
```

## Setup

Generate a private key (one-time):

```bash
python -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

Set it server-side:

```bash
export GLUECO_PRIVATE_KEY="your-base64-encoded-32-byte-key"
```

## Quick Start

### 1. Connect to Gateway

```python
from glueco_sdk import connect, handle_callback, create_transport

# Connect (SDK sends public key to proxy)
result = connect(
    pairing_string="pair::https://gateway.example.com::abc123...",
    app_name="My App",
    requested_permissions=[
        {"resource_id": "llm:groq", "actions": ["chat.completions"]},
    ],
    redirect_uri="https://myapp.com/callback",
)

# Redirect user to approval
print(f"Approve at: {result['approval_url']}")
```

### 2. Handle Callback

```python
# After user approves
callback = handle_callback(status, app_id, expires_at)

if callback["approved"]:
    # Persist ONLY these two values:
    my_db.save(
        app_id=callback["app_id"],
        proxy_url=result["proxy_url"],
    )
```

### 3. Make Requests

```python
# Load saved credentials
app_id, proxy_url = my_db.load()

# Create transport (uses GLUECO_PRIVATE_KEY from env)
transport = create_transport(proxy_url, app_id)

# Use with plugins
from glueco_plugin_llm import llm_client

llm = llm_client(transport)
response = llm.chat_completions(
    provider="groq",
    model="llama-3.1-8b-instant",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.content)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GLUECO_PRIVATE_KEY` | Yes | Base64-encoded 32-byte Ed25519 seed |

## How It Works

1. **Your app** provisions a private key (stored server-side in env)
2. **SDK** derives the public key from that seed
3. **During connect**, SDK sends public key to proxy (proxy stores it with app_id)
4. **During requests**, SDK signs with env key, proxy verifies with stored public key

App only persists: `{app_id, proxy_url}` — no secrets!

## API Reference

### connect()

```python
connect(
    pairing_string: str,
    app_name: str,
    requested_permissions: list,
    redirect_uri: str,
) -> dict  # {approval_url, proxy_url, expires_at}
```

### handle_callback()

```python
handle_callback(status, app_id, expires_at) -> dict
# {approved: bool, app_id: str, expires_at: datetime}
```

### create_transport()

```python
create_transport(proxy_url: str, app_id: str) -> GatewayTransport
```

## Error Handling

```python
from glueco_sdk import GatewayError, KeyError

try:
    transport = create_transport(proxy_url, app_id)
except KeyError as e:
    print(f"Missing GLUECO_PRIVATE_KEY: {e}")

try:
    response = transport.request(...)
except GatewayError as e:
    print(f"Gateway error [{e.code}]: {e.message}")
```

## Changelog

### v0.4.0 (Breaking)
- Switched to env-only key: `GLUECO_PRIVATE_KEY`
- Removed keypair generation
- Removed storage abstractions
- New `create_transport(proxy_url, app_id)` API
- `connect()` no longer returns keypair

### v0.3.0
- Added GatewayTransport protocol
- Added storage abstractions (removed in 0.4.0)

## License

MIT
