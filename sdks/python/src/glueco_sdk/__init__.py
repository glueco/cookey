"""
Glueco SDK for Python

A minimal transport + signing layer for the Glueco Gateway.
Uses GLUECO_PRIVATE_KEY from environment for PoP (Proof-of-Possession) signing.

This SDK:
- Parses pairing strings and initiates connection
- Signs requests using env-based Ed25519 key
- Provides transport for plugins

The app only needs to persist: app_id, proxy_url

Quick Start:
    >>> import os
    >>> os.environ["GLUECO_PRIVATE_KEY"] = "base64-32-byte-seed..."
    >>> 
    >>> from glueco_sdk import connect, handle_callback, create_transport
    >>> 
    >>> # 1. Connect (SDK uses env key, sends public key to proxy)
    >>> result = connect(
    ...     pairing_string="pair::https://gw.example.com::abc123",
    ...     app_name="My App",
    ...     requested_permissions=[...],
    ...     redirect_uri="https://myapp.com/callback",
    ... )
    >>> # Redirect user to result["approval_url"]
    >>> 
    >>> # 2. Handle callback - persist app_id and proxy_url
    >>> callback = handle_callback(status, app_id)
    >>> my_db.save(app_id=callback["app_id"], proxy_url=result["proxy_url"])
    >>> 
    >>> # 3. Create transport for API calls
    >>> transport = create_transport(proxy_url, app_id)
    >>> 
    >>> # 4. Use with plugins
    >>> from glueco_plugin_llm import llm_client
    >>> llm = llm_client(transport)
    >>> response = llm.chat_completions(provider="groq", model="llama3", ...)
"""

__version__ = "0.4.0"

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
    connect,
    handle_callback,
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
    "connect",
    "handle_callback",
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
