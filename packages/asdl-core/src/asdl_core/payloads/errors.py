"""Stable payload-store error types."""

from __future__ import annotations

from typing import Literal, TypeAlias

PayloadErrorType: TypeAlias = Literal[
    "payload_session_required",
    "payload_session_invalid",
    "payload_root_invalid",
    "payload_directory_unsafe",
    "payload_write_failed",
    "payload_lookup_failed",
]


class PayloadError(RuntimeError):
    """Exception carrying a stable payload error type."""

    error_type: PayloadErrorType
    message: str

    def __init__(self, *, error_type: PayloadErrorType, message: str) -> None:
        self.error_type = error_type
        self.message = message
        super().__init__(message)
