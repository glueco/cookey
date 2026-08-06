"""
PoP (Proof-of-Possession) signing for the Glueco Gateway.

Implements PoP v1 protocol for authenticating requests using Ed25519 signatures.
Uses the private key from GLUECO_PRIVATE_KEY environment variable.
"""

from __future__ import annotations

import hashlib
import secrets
import time
from dataclasses import dataclass
from typing import Optional

from nacl.signing import SigningKey

from .keys import base64url_encode, load_seed_from_env, get_signing_key


# PoP protocol version
POP_VERSION = "1"


@dataclass(frozen=True)
class PopHeaders:
    """PoP authentication headers for requests.
    
    Attributes:
        x_pop_v: Protocol version.
        x_app_id: Application ID.
        x_ts: Unix timestamp.
        x_nonce: Random nonce.
        x_sig: Request signature.
    """
    x_pop_v: str
    x_app_id: str
    x_ts: str
    x_nonce: str
    x_sig: str
    
    def to_dict(self) -> dict:
        """Convert to header dictionary."""
        return {
            "x-pop-v": self.x_pop_v,
            "x-app-id": self.x_app_id,
            "x-ts": self.x_ts,
            "x-nonce": self.x_nonce,
            "x-sig": self.x_sig,
        }


def hash_body(body: bytes) -> str:
    """
    Hash the request body using SHA-256.
    
    Returns base64url-encoded hash.
    """
    digest = hashlib.sha256(body).digest()
    return base64url_encode(digest)


def build_canonical_request(
    method: str,
    path_with_query: str,
    app_id: str,
    ts: str,
    nonce: str,
    body_hash: str,
) -> str:
    """
    Build the canonical request string to be signed.
    
    Format (v1):
        v1\\n
        METHOD\\n
        /path?query\\n
        app_id\\n
        timestamp\\n
        nonce\\n
        body_hash\\n
    """
    return "\n".join([
        "v1",
        method.upper(),
        path_with_query,
        app_id,
        ts,
        nonce,
        body_hash,
        "",  # Trailing newline
    ])


def sign_request(
    app_id: str,
    method: str,
    path_with_query: str,
    body: bytes = b"",
    *,
    timestamp: Optional[int] = None,
    nonce: Optional[str] = None,
) -> PopHeaders:
    """
    Sign a request using the env private key.
    
    Loads GLUECO_PRIVATE_KEY from environment and signs the request.
    
    Args:
        app_id: Application ID registered with the gateway.
        method: HTTP method (GET, POST, etc.).
        path_with_query: Request path including query string.
        body: Request body bytes (empty for GET requests).
        timestamp: Unix timestamp in seconds (defaults to current time).
        nonce: Random nonce string (defaults to random 16 chars).
        
    Returns:
        PopHeaders containing all required authentication headers.
        
    Raises:
        KeyError: If GLUECO_PRIVATE_KEY env var is missing or invalid.
    """
    # Load seed from environment
    seed = load_seed_from_env()
    signing_key = get_signing_key(seed)
    
    # Generate timestamp and nonce if not provided
    ts = str(timestamp or int(time.time()))
    _nonce = nonce or secrets.token_urlsafe(16)[:16]
    
    # Hash the body
    body_hash = hash_body(body)
    
    # Build canonical request
    canonical = build_canonical_request(
        method=method,
        path_with_query=path_with_query,
        app_id=app_id,
        ts=ts,
        nonce=_nonce,
        body_hash=body_hash,
    )
    
    # Sign the canonical request
    signed = signing_key.sign(canonical.encode("utf-8"))
    signature = base64url_encode(signed.signature)
    
    return PopHeaders(
        x_pop_v=POP_VERSION,
        x_app_id=app_id,
        x_ts=ts,
        x_nonce=_nonce,
        x_sig=signature,
    )
