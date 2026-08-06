"""
Connection flow for the Glueco Gateway SDK.

Handles:
1. Parsing pairing strings
2. Initiating the connect/prepare flow (sends public key to proxy)
3. Handling callbacks after user approval

The SDK uses GLUECO_PRIVATE_KEY from environment. It derives the public key
and sends it during connection. The app only needs to persist app_id and proxy_url.

Example:
    >>> from glueco_sdk import connect, handle_callback
    >>> 
    >>> # Initiate connection (SDK loads key from env)
    >>> result = connect(
    ...     pairing_string="pair::https://gateway.example.com::abc123",
    ...     app_name="My App",
    ...     requested_permissions=[
    ...         {"resource_id": "llm:groq", "actions": ["chat.completions"]}
    ...     ],
    ...     redirect_uri="https://myapp.com/callback",
    ... )
    >>> # Returns only: {approval_url, proxy_url, expires_at} - NO secrets!
    >>> 
    >>> # After user approval, handle callback
    >>> callback = handle_callback(status, app_id, expires_at)
    >>> # App persists: callback["app_id"], proxy_url
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
# CONNECT FLOW
# =============================================================================

def connect(
    pairing_string: str,
    app_name: str,
    requested_permissions: List[Dict[str, Any]],
    redirect_uri: str,
    *,
    app_description: Optional[str] = None,
    app_homepage: Optional[str] = None,
    timeout: float = 30.0,
) -> Dict[str, Any]:
    """
    Initiate the connection flow with the gateway.
    
    This function:
    1. Parses the pairing string
    2. Loads private key seed from GLUECO_PRIVATE_KEY env
    3. Derives public key from seed
    4. Calls the /api/connect/prepare endpoint with public_key
    5. Returns the approval URL (NO secrets returned)
    
    Args:
        pairing_string: Pairing string from gateway admin.
        app_name: Application name shown during approval.
        requested_permissions: List of permission requests.
        redirect_uri: URL to redirect back to after approval.
        app_description: Optional app description.
        app_homepage: Optional app homepage URL.
        timeout: Request timeout in seconds.
        
    Returns:
        Dict with:
            - approval_url: URL to redirect user to
            - proxy_url: Gateway proxy URL
            - expires_at: Datetime when session expires
        (NO private key or keypair returned!)
            
    Raises:
        KeyError: If GLUECO_PRIVATE_KEY env var is missing or invalid.
        ValueError: If pairing string is invalid.
        ConnectError: If gateway request fails.
    """
    # Parse pairing string
    pairing_info = parse_pairing_string(pairing_string)
    
    # Load seed from env and derive public key
    seed = load_seed_from_env()
    public_key = public_key_from_seed(seed)
    public_key_b64 = base64_encode(public_key)
    
    # Build permission list for API
    permissions_payload = []
    for perm in requested_permissions:
        perm_dict = {
            "resourceId": perm["resource_id"],
            "actions": perm["actions"],
        }
        if "requested_duration" in perm:
            duration = perm["requested_duration"]
            perm_dict["requestedDuration"] = {
                "type": duration["type"],
                duration["type"]: duration["value"],
            }
        permissions_payload.append(perm_dict)
    
    # Build request payload - includes public_key for proxy to store
    request_payload: Dict[str, Any] = {
        "connectCode": pairing_info.connect_code,
        "app": {"name": app_name},
        "publicKey": public_key_b64,  # Proxy stores this with app_id
        "requestedPermissions": permissions_payload,
        "redirectUri": redirect_uri,
    }
    
    if app_description:
        request_payload["app"]["description"] = app_description
    if app_homepage:
        request_payload["app"]["homepage"] = app_homepage
    
    # Call prepare endpoint
    try:
        response = httpx.post(
            f"{pairing_info.proxy_url}/api/connect/prepare",
            json=request_payload,
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
    
    # Return ONLY non-secret data
    return {
        "approval_url": data["approvalUrl"],
        "proxy_url": pairing_info.proxy_url,
        "expires_at": datetime.fromisoformat(data["expiresAt"].replace("Z", "+00:00")),
    }


def handle_callback(
    status: Optional[str],
    app_id: Optional[str],
    expires_at: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Handle the callback after user approval/denial.
    
    Call this when the user is redirected back to your app.
    The app should persist app_id and proxy_url.
    
    Args:
        status: "status" query parameter ("approved" or "denied").
        app_id: "app_id" query parameter (if approved).
        expires_at: "expires_at" query parameter (optional, ISO format).
        
    Returns:
        Dict with:
            - approved: bool
            - app_id: str (if approved) - PERSIST THIS
            - expires_at: datetime (if provided)
    """
    if status == "approved" and app_id:
        exp = None
        if expires_at:
            try:
                exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                pass
        return {"approved": True, "app_id": app_id, "expires_at": exp}
    
    return {"approved": False, "app_id": None, "expires_at": None}
