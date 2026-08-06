"""
Error types for the Glueco Gateway SDK.

Provides structured error handling matching the TypeScript SDK's GatewayError.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


class GatewayError(Exception):
    """
    Error returned from the gateway.
    
    Provides structured error information including error code,
    HTTP status, and optional request context.
    
    Attributes:
        code: Error code (e.g., "UNAUTHORIZED", "RATE_LIMITED").
        message: Human-readable error message.
        status: HTTP status code.
        request_id: Optional request ID for debugging.
        details: Optional additional error details.
    """
    
    def __init__(
        self,
        code: str,
        message: str,
        status: int,
        *,
        request_id: Optional[str] = None,
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.status = status
        self.request_id = request_id
        self.details = details
    
    def is_code(self, code: str) -> bool:
        """Check if this error matches a specific error code."""
        return self.code == code
    
    def to_dict(self) -> dict:
        """Convert to dictionary for logging/serialization."""
        result = {
            "code": self.code,
            "message": self.message,
            "status": self.status,
        }
        if self.request_id:
            result["request_id"] = self.request_id
        if self.details is not None:
            result["details"] = self.details
        return result
    
    def __repr__(self) -> str:
        return (
            f"GatewayError(code={self.code!r}, message={self.message!r}, "
            f"status={self.status})"
        )


class ConnectError(Exception):
    """Error during connection flow.
    
    Attributes:
        message: Error message.
        status_code: HTTP status code (0 for network errors).
    """
    
    def __init__(self, message: str, status_code: int = 0) -> None:
        super().__init__(message)
        self.status_code = status_code


def parse_gateway_error(body: Any, status: int) -> Optional[GatewayError]:
    """
    Parse a gateway error response.
    
    Args:
        body: Response body (dict or other).
        status: HTTP status code.
        
    Returns:
        GatewayError if body matches expected format, None otherwise.
    """
    if not isinstance(body, dict):
        return None
    
    error = body.get("error")
    if not isinstance(error, dict):
        return None
    
    code = error.get("code")
    message = error.get("message")
    
    if not code or not message:
        return None
    
    return GatewayError(
        code=code,
        message=message,
        status=status,
        request_id=error.get("requestId"),
        details=error.get("details"),
    )
