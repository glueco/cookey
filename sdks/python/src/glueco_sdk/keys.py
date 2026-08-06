"""
Key management for the Glueco Gateway SDK.

Loads Ed25519 private key seed from environment variable `GLUECO_PRIVATE_KEY`.
SDK never generates keys - the app provisions a key and stores it server-side.

Key Format:
    GLUECO_PRIVATE_KEY must be base64-encoded 32-byte Ed25519 seed.
    
Example:
    # Generate a key (one-time, outside SDK):
    import secrets, base64
    seed = secrets.token_bytes(32)
    print(base64.b64encode(seed).decode())
    
    # Set in environment:
    export GLUECO_PRIVATE_KEY="base64-encoded-32-bytes..."
"""

from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from typing import Tuple

from nacl.signing import SigningKey, VerifyKey


# Environment variable name
ENV_PRIVATE_KEY = "GLUECO_PRIVATE_KEY"

# Expected seed length
SEED_LENGTH = 32


class KeyError(Exception):
    """Error loading or validating keys."""
    pass


def load_seed_from_env() -> bytes:
    """
    Load Ed25519 seed from GLUECO_PRIVATE_KEY environment variable.
    
    Returns:
        32-byte seed for Ed25519 signing.
        
    Raises:
        KeyError: If env var is missing or invalid.
    """
    value = os.environ.get(ENV_PRIVATE_KEY)
    
    if not value:
        raise KeyError(
            f"Missing environment variable: {ENV_PRIVATE_KEY}\n"
            f"Set it to a base64-encoded 32-byte Ed25519 seed.\n"
            f"Generate with: python -c \"import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())\""
        )
    
    try:
        seed = base64.b64decode(value)
    except Exception as e:
        raise KeyError(
            f"Invalid base64 in {ENV_PRIVATE_KEY}: {e}\n"
            f"Expected base64-encoded 32 bytes."
        )
    
    if len(seed) != SEED_LENGTH:
        raise KeyError(
            f"Invalid seed length in {ENV_PRIVATE_KEY}: got {len(seed)} bytes, expected {SEED_LENGTH}.\n"
            f"Must be exactly 32 bytes (256 bits) base64-encoded."
        )
    
    return seed


def public_key_from_seed(seed: bytes) -> bytes:
    """
    Derive Ed25519 public key from seed.
    
    Args:
        seed: 32-byte Ed25519 seed.
        
    Returns:
        32-byte public key.
    """
    signing_key = SigningKey(seed)
    return bytes(signing_key.verify_key)


def public_key_from_seed_base64(seed: bytes) -> str:
    """
    Derive Ed25519 public key from seed and return as base64.
    
    Args:
        seed: 32-byte Ed25519 seed.
        
    Returns:
        Base64-encoded public key string.
    """
    return base64_encode(public_key_from_seed(seed))


def get_signing_key(seed: bytes) -> SigningKey:
    """
    Get SigningKey from seed for signing operations.
    
    Args:
        seed: 32-byte Ed25519 seed.
        
    Returns:
        SigningKey for use with nacl.
    """
    return SigningKey(seed)


def sign(seed: bytes, message: bytes) -> bytes:
    """
    Sign a message with the Ed25519 seed.
    
    Args:
        seed: 32-byte Ed25519 seed.
        message: Message bytes to sign.
        
    Returns:
        64-byte signature.
    """
    signing_key = SigningKey(seed)
    signed = signing_key.sign(message)
    return signed.signature


def sign_to_base64url(seed: bytes, message: bytes) -> str:
    """
    Sign message and return base64url-encoded signature.
    
    Args:
        seed: 32-byte Ed25519 seed.
        message: Message bytes to sign.
        
    Returns:
        Base64URL-encoded signature string.
    """
    signature = sign(seed, message)
    return base64url_encode(signature)


def verify(public_key: bytes, message: bytes, signature: bytes) -> bool:
    """
    Verify an Ed25519 signature.
    
    Args:
        public_key: 32-byte public key.
        message: Original message bytes.
        signature: 64-byte signature.
        
    Returns:
        True if valid, False otherwise.
    """
    try:
        verify_key = VerifyKey(public_key)
        verify_key.verify(message, signature)
        return True
    except Exception:
        return False


def base64url_encode(data: bytes) -> str:
    """Encode bytes to base64url (URL-safe, no padding)."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def base64url_decode(data: str) -> bytes:
    """Decode base64url string to bytes."""
    padding = 4 - (len(data) % 4)
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data)


def base64_encode(data: bytes) -> str:
    """Encode bytes to standard base64."""
    return base64.b64encode(data).decode("ascii")


def base64_decode(data: str) -> bytes:
    """Decode standard base64 string to bytes."""
    return base64.b64decode(data)
