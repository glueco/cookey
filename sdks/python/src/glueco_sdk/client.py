"""
Transport creation for the Glueco Gateway SDK.

Provides create_transport() - the simplest way to get a signed transport.
Requires only proxy_url and app_id. Uses GLUECO_PRIVATE_KEY from env.

Example:
    >>> from glueco_sdk import create_transport
    >>> 
    >>> # App has saved these from the callback
    >>> transport = create_transport(
    ...     proxy_url="https://gateway.example.com",
    ...     app_id="app_abc123",
    ... )
    >>> 
    >>> # Use with plugins
    >>> from glueco_plugin_llm import llm_client
    >>> llm = llm_client(transport)
    >>> response = llm.chat_completions(provider="groq", model="llama3", ...)
"""

from __future__ import annotations

import json
from typing import Any, Dict, Iterator, Optional

import httpx

from .errors import GatewayError, parse_gateway_error
from .pop import sign_request
from .transport import GatewayResponse, GatewayStreamResponse, GatewayTransport


def create_transport(
    proxy_url: str,
    app_id: str,
    *,
    timeout: float = 60.0,
) -> GatewayTransport:
    """
    Create a GatewayTransport for making signed requests.
    
    This is the main entry point for using the SDK after connection.
    Uses GLUECO_PRIVATE_KEY from environment to sign all requests.
    
    Args:
        proxy_url: Gateway proxy URL (from pairing or saved state).
        app_id: Application ID (from callback, persisted by app).
        timeout: Default request timeout in seconds.
        
    Returns:
        GatewayTransport for use with plugin clients.
        
    Raises:
        KeyError: If GLUECO_PRIVATE_KEY env var is missing or invalid.
        
    Example:
        >>> transport = create_transport(
        ...     proxy_url="https://gateway.example.com",
        ...     app_id="app_abc123",
        ... )
        >>> response = transport.request(
        ...     resource_id="llm:groq",
        ...     action="chat.completions",
        ...     payload={...},
        ... )
    """
    return _TransportImpl(
        app_id=app_id,
        proxy_url=proxy_url.rstrip("/"),
        timeout=timeout,
    )


class _TransportImpl:
    """GatewayTransport implementation using env-based signing."""
    
    def __init__(
        self,
        app_id: str,
        proxy_url: str,
        timeout: float,
    ) -> None:
        self._app_id = app_id
        self._proxy_url = proxy_url
        self._timeout = timeout
        self._http_client: Optional[httpx.Client] = None
    
    @property
    def proxy_url(self) -> str:
        return self._proxy_url
    
    @property
    def app_id(self) -> str:
        return self._app_id
    
    def _get_client(self) -> httpx.Client:
        if self._http_client is None:
            self._http_client = httpx.Client(timeout=self._timeout)
        return self._http_client
    
    def request(
        self,
        resource_id: str,
        action: str,
        payload: Dict[str, Any],
        *,
        method: str = "POST",
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[float] = None,
    ) -> GatewayResponse[Any]:
        """Make a signed request to a resource action."""
        # Build URL: /r/<type>/<provider>/<action>
        parts = resource_id.split(":", 1)
        if len(parts) != 2:
            raise ValueError(f"Invalid resource_id: {resource_id}")
        
        resource_type, provider = parts
        action_path = action.replace(".", "/")
        path = f"/r/{resource_type}/{provider}/{action_path}"
        
        # Serialize body
        body_bytes = json.dumps(payload).encode("utf-8")
        
        # Sign request (uses env key internally)
        pop_headers = sign_request(
            app_id=self._app_id,
            method=method,
            path_with_query=path,
            body=body_bytes,
        )
        
        # Build headers
        request_headers = {
            "Content-Type": "application/json",
            **pop_headers.to_dict(),
            **(headers or {}),
        }
        
        # Make request
        url = f"{self._proxy_url}{path}"
        response = self._get_client().request(
            method=method,
            url=url,
            content=body_bytes,
            headers=request_headers,
            timeout=timeout or self._timeout,
        )
        
        # Handle error responses
        if not response.is_success:
            self._handle_error(response)
        
        # Parse response
        return GatewayResponse(
            data=response.json(),
            status=response.status_code,
            headers=dict(response.headers),
        )
    
    def request_stream(
        self,
        resource_id: str,
        action: str,
        payload: Dict[str, Any],
        *,
        method: str = "POST",
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[float] = None,
    ) -> GatewayStreamResponse:
        """Make a streaming request to a resource action."""
        # Build URL
        parts = resource_id.split(":", 1)
        if len(parts) != 2:
            raise ValueError(f"Invalid resource_id: {resource_id}")
        
        resource_type, provider = parts
        action_path = action.replace(".", "/")
        path = f"/r/{resource_type}/{provider}/{action_path}"
        
        # Add stream flag
        stream_payload = {**payload, "stream": True}
        body_bytes = json.dumps(stream_payload).encode("utf-8")
        
        # Sign request
        pop_headers = sign_request(
            app_id=self._app_id,
            method=method,
            path_with_query=path,
            body=body_bytes,
        )
        
        # Build headers
        request_headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            **pop_headers.to_dict(),
            **(headers or {}),
        }
        
        # Make streaming request
        url = f"{self._proxy_url}{path}"
        response = self._get_client().stream(
            method=method,
            url=url,
            content=body_bytes,
            headers=request_headers,
            timeout=timeout or self._timeout,
        )
        
        response_obj = response.__enter__()
        if not response_obj.is_success:
            self._handle_error(response_obj)
        
        return GatewayStreamResponse(
            stream=response_obj.iter_bytes(),
            status=response_obj.status_code,
            headers=dict(response_obj.headers),
        )
    
    def _handle_error(self, response: httpx.Response) -> None:
        """Parse and raise gateway error."""
        try:
            body = response.json()
            error = parse_gateway_error(body, response.status_code)
            if error:
                raise error
        except json.JSONDecodeError:
            pass
        
        raise GatewayError(
            code="UNKNOWN",
            message=response.text or f"Request failed: {response.status_code}",
            status=response.status_code,
        )
    
    def close(self) -> None:
        """Close the HTTP client."""
        if self._http_client:
            self._http_client.close()
            self._http_client = None
    
    def __enter__(self) -> "_TransportImpl":
        return self
    
    def __exit__(self, *args: Any) -> None:
        self.close()
