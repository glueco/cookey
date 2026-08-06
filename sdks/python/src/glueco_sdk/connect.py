"""
Connection flow for the Cookey SDK: submit a grant document to a gateway
using a pairing string.

The gateway accepts ONLY grant documents (docs/GRANT_SPEC.md). When the
document requests PoP auth and carries no publicKey, it is derived from
GLUECO_PRIVATE_KEY.

Example:
    >>> from glueco_sdk import submit_grant
    >>>
    >>> result = submit_grant(
    ...     pairing_string="pair::https://gateway.example.com::abc123",
    ...     grant={
    ...         "specVersion": "1",
    ...         "app": {"name": "My App"},
    ...         "runtime": "server",
    ...         "auth": "pop",
    ...         "requests": [
    ...             {"resource": "llm:*", "actions": ["chat.completions"],
    ...              "reason": "Core chat features."}
    ...         ],
    ...         "duration": "90d",
    ...     },
    ... )
    >>> # {"approval_url", "proxy_url", "grant_id", "expires_at"} — no secrets
    >>> # Poll {proxy_url}/api/connect/status?session={grant_id} for approval.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

from .errors import ConnectError
from .keys import load_seed_from_env, public_key_from_seed, base64_encode


# =============================================================================
# PAIRING STRING
# =============================================================================

@dataclass(frozen=True)
class PairingInfo:
    """Parsed pairing string components.
    
    Attributes:
        proxy_url: Gateway proxy URL.
        connect_code: Connection code for pairing.
    """
    proxy_url: str
    connect_code: str


def parse_pairing_string(pairing_string: str) -> PairingInfo:
    """
    Parse a pairing string into its components.
    
    Format: pair::<proxy_url>::<connect_code>
    
    Args:
        pairing_string: Raw pairing string.
        
    Returns:
        PairingInfo with proxy_url and connect_code.
        
    Raises:
        ValueError: If format is invalid.
    """
    trimmed = pairing_string.strip()
    
    if not trimmed.startswith("pair::"):
        raise ValueError('Invalid pairing string: must start with "pair::"')
    
    parts = trimmed.split("::")
    if len(parts) != 3:
        raise ValueError(
            "Invalid pairing string format. Expected: pair::<proxy_url>::<connect_code>"
        )
    
    _, proxy_url, connect_code = parts
    
    if not proxy_url.startswith(("http://", "https://")):
        raise ValueError(f"Invalid proxy URL in pairing string: {proxy_url}")
    
    if not connect_code or len(connect_code) < 16:
        raise ValueError("Invalid connect code in pairing string")
    
    return PairingInfo(proxy_url=proxy_url, connect_code=connect_code)


def create_pairing_string(proxy_url: str, connect_code: str) -> str:
    """Create a pairing string from components."""
    return f"pair::{proxy_url}::{connect_code}"


# =============================================================================
# GRANT SUBMISSION
# =============================================================================

def submit_grant(
    pairing_string: str,
    grant: Dict[str, Any],
    *,
    timeout: float = 30.0,
) -> Dict[str, Any]:
    """
    Submit a grant document to the gateway.

    Args:
        pairing_string: Pairing string from the gateway admin.
        grant: The grant document (docs/GRANT_SPEC.md). If auth is "pop"
            and publicKey is missing, it is derived from GLUECO_PRIVATE_KEY.
        timeout: Request timeout in seconds.

    Returns:
        Dict with approval_url, proxy_url, grant_id, expires_at — no secrets.

    Raises:
        KeyError: If GLUECO_PRIVATE_KEY is needed but missing/invalid.
        ValueError: If the pairing string is invalid.
        ConnectError: If the gateway rejects the request.
    """
    pairing_info = parse_pairing_string(pairing_string)

    document = dict(grant)
    if document.get("auth") == "pop" and not document.get("publicKey"):
        seed = load_seed_from_env()
        document["publicKey"] = base64_encode(public_key_from_seed(seed))

    try:
        response = httpx.post(
            f"{pairing_info.proxy_url}/api/connect/prepare",
            json={"connectCode": pairing_info.connect_code, "grant": document},
            headers={"Content-Type": "application/json"},
            timeout=timeout,
        )
    except httpx.RequestError as e:
        raise ConnectError(f"Failed to connect to gateway: {e}", 0)

    if not response.is_success:
        try:
            body = response.json()
            error_message = (
                body.get("error", {}).get("message")
                or body.get("error")
                or f"Connection failed: {response.status_code}"
            )
        except Exception:
            error_message = f"Connection failed: {response.status_code}"
        raise ConnectError(error_message, response.status_code)

    data = response.json()
    return {
        "approval_url": data["approvalUrl"],
        "proxy_url": pairing_info.proxy_url,
        "grant_id": data.get("grantId"),
        "expires_at": datetime.fromisoformat(data["expiresAt"].replace("Z", "+00:00")),
    }
