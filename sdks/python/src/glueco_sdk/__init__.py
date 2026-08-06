"""
Cookey SDK for Python — PoP (Ed25519) signing for long-lived grants.

Bearer-token users need NO SDK: a ck_ token works with any HTTP client or
the unmodified openai package pointed at {gateway}/r/llm/<provider>/v1.

This SDK:
- Submits grant documents (docs/GRANT_SPEC.md) with a pairing string
- Signs requests with the env-based Ed25519 key (GLUECO_PRIVATE_KEY)
- Provides a small httpx transport for signed requests

Quick Start:
    >>> import os
    >>> os.environ["GLUECO_PRIVATE_KEY"] = "base64-32-byte-seed..."
    >>>
    >>> from glueco_sdk import submit_grant, create_transport
    >>>
    >>> # 1. Submit a grant document (public key auto-derived for pop auth)
    >>> result = submit_grant(
    ...     pairing_string="pair::https://gw.example.com::abc123",
    ...     grant={
    ...         "specVersion": "1",
    ...         "app": {"name": "My App"},
    ...         "runtime": "server",
    ...         "auth": "pop",
    ...         "requests": [{"resource": "llm:*", "actions": ["chat.completions"],
    ...                       "reason": "Core chat features."}],
    ...         "duration": "90d",
    ...     },
    ... )
    >>> # Owner approves at result["approval_url"]; poll
    >>> # {proxy_url}/api/connect/status?session={result["grant_id"]}
    >>>
    >>> # 2. Signed requests after approval
    >>> transport = create_transport(result["proxy_url"], app_id)
    >>> response = transport.request("llm:groq", "chat.completions", {...})
"""

__version__ = "1.0.0"

# Transport creation (main entry point)
from .client import create_transport

# Transport protocol (for plugin development)
from .transport import (
    GatewayTransport,
    GatewayResponse,
    GatewayStreamResponse,
)

# Errors
from .errors import (
    GatewayError,
    ConnectError,
    parse_gateway_error,
)

# Connection flow
from .connect import (
    parse_pairing_string,
    create_pairing_string,
    submit_grant,
    PairingInfo,
)

# Key utilities (for advanced use)
from .keys import (
    load_seed_from_env,
    public_key_from_seed,
    public_key_from_seed_base64,
    get_signing_key,
    sign,
    sign_to_base64url,
    verify,
    base64url_encode,
    base64url_decode,
    base64_encode,
    base64_decode,
    KeyError,
    ENV_PRIVATE_KEY,
    SEED_LENGTH,
)

__all__ = [
    # Version
    "__version__",
    # Transport
    "create_transport",
    "GatewayTransport",
    "GatewayResponse",
    "GatewayStreamResponse",
    # Errors
    "GatewayError",
    "ConnectError",
    "parse_gateway_error",
    # Connection
    "parse_pairing_string",
    "create_pairing_string",
    "submit_grant",
    "PairingInfo",
    # Keys
    "load_seed_from_env",
    "public_key_from_seed",
    "public_key_from_seed_base64",
    "get_signing_key",
    "sign",
    "sign_to_base64url",
    "verify",
    "base64url_encode",
    "base64url_decode",
    "base64_encode",
    "base64_decode",
    "KeyError",
    "ENV_PRIVATE_KEY",
    "SEED_LENGTH",
]
