from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, TypeVar

from twerk_core.clinkr.command import ClinkrCommandError

T = TypeVar("T")


@dataclass(frozen=True)
class ClinkrExit(Generic[T]):
    exit_code: int
    result: T | None = None
    error: ClinkrCommandError | None = None

    @classmethod
    def ok(cls, result: T) -> ClinkrExit[T]:
        return cls(exit_code=0, result=result)

    @classmethod
    def negative(cls, result: T, *, exit_code: int = 1) -> ClinkrExit[T]:
        return cls(exit_code=exit_code, result=result)

    @classmethod
    def fail(
        cls,
        *,
        error_type: str,
        message: str,
        exit_code: int = 1,
    ) -> ClinkrExit[T]:
        return cls(
            exit_code=exit_code,
            error=ClinkrCommandError(error_type=error_type, message=message),
        )
