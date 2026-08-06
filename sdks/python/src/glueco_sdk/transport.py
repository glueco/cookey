"""
Transport types and protocol for the Glueco Gateway SDK.

Defines GatewayTransport - the interface that plugins use to make requests.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Generic, Iterator, Optional, TypeVar, Protocol, runtime_checkable


T = TypeVar("T")


@dataclass
class GatewayResponse(Generic[T]):
    """Response from a gateway request.
    
    Attributes:
        data: Parsed JSON response data.
        status: HTTP status code.
        headers: Response headers.
    """
    data: T
    status: int
    headers: Dict[str, str]


@dataclass
class GatewayStreamResponse:
    """Streaming response from a gateway request.
    
    Attributes:
        stream: Iterator of bytes chunks (SSE or raw).
        status: HTTP status code.
        headers: Response headers.
    """
    stream: Iterator[bytes]
    status: int
    headers: Dict[str, str]
    
    def iter_lines(self) -> Iterator[str]:
        """Iterate over SSE lines."""
        buffer = b""
        for chunk in self.stream:
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                yield line.decode("utf-8").strip()


@runtime_checkable
class GatewayTransport(Protocol):
    """Protocol for gateway transport implementations.
    
    Plugins use this interface to make signed requests.
    The SDK provides implementations via create_transport().
    
    Example:
        >>> def my_plugin(transport: GatewayTransport):
        ...     response = transport.request(
        ...         resource_id="llm:groq",
        ...         action="chat.completions",
        ...         payload={...},
        ...     )
        ...     return response.data
    """
    
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
        ...
    
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
        """Make a streaming signed request."""
        ...
    
    @property
    def proxy_url(self) -> str:
        """Gateway proxy URL."""
        ...
    
    @property
    def app_id(self) -> str:
        """Application ID."""
        ...
