from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, TypeVar

from twerk_core.clinkr.command import ClinkrCommandError

T = TypeVar("T")


@dataclass(frozen=True)
class ClinkrExit(Generic[T]):
    """Structured command outcome for format-aware clinkr operations.

    Use ``ok`` for normal success, ``negative`` for a non-error negative
    result that should still carry structured data, and ``fail`` for
    command errors that should emit a ``ClinkrCommandError`` payload.
    """

    exit_code: int
    result: T | None = None
    error: ClinkrCommandError | None = None

    @classmethod
    def ok(cls, result: T) -> ClinkrExit[T]:
        """Return a successful outcome with a result payload."""
        return cls(exit_code=0, result=result)

    @classmethod
    def negative(cls, result: T, *, exit_code: int = 1) -> ClinkrExit[T]:
        """Return a structured negative result without converting it to an error."""
        return cls(exit_code=exit_code, result=result)

    @classmethod
    def fail(
        cls,
        *,
        error_type: str,
        message: str,
        exit_code: int = 1,
    ) -> ClinkrExit[T]:
        """Return a failed outcome with a serialized command error payload."""
        return cls(
            exit_code=exit_code,
            error=ClinkrCommandError(error_type=error_type, message=message),
        )
