"""Stable prompt-resolution error types."""

from __future__ import annotations

from typing import Literal, TypeAlias

PromptErrorType: TypeAlias = Literal[
    "prompt_name_invalid",
    "prompt_root_invalid",
    "prompt_not_found",
]


class PromptError(RuntimeError):
    """Exception carrying a stable prompt-resolution error type."""

    error_type: PromptErrorType
    message: str

    def __init__(self, *, error_type: PromptErrorType, message: str) -> None:
        self.error_type = error_type
        self.message = message
        super().__init__(message)
