from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Generic, TypeVar

from twerk_core.clinkr.dataclass_json import JsonSerializable, serialize_to_json_dict

T = TypeVar("T", bound=JsonSerializable)


class ExitStatus(Enum):
    OK = 0
    NEGATIVE = 1
    FAILURE = 2


@dataclass(frozen=True)
class ClinkrExit(Generic[T]):
    status: ExitStatus
    data: T | None = None
    message: str | None = None
    error_type: str | None = None

    def __post_init__(self) -> None:
        if self.status is ExitStatus.OK:
            if self.message is not None or self.error_type is not None:
                raise ValueError("ClinkrExit.ok must not carry message or error_type")
        elif self.status is ExitStatus.NEGATIVE:
            if self.message is None:
                raise ValueError("ClinkrExit.negative requires a message")
            if self.error_type is not None:
                raise ValueError("ClinkrExit.negative must not carry an error_type")
        elif self.status is ExitStatus.FAILURE:
            if self.message is None or self.error_type is None:
                raise ValueError("ClinkrExit.failure requires both error_type and message")

    @classmethod
    def ok(cls, data: T) -> ClinkrExit[T]:
        return cls(status=ExitStatus.OK, data=data)

    @classmethod
    def negative(cls, data: T | None = None, *, message: str) -> ClinkrExit[T]:
        return cls(status=ExitStatus.NEGATIVE, data=data, message=message)

    @classmethod
    def failure(
        cls,
        *,
        error_type: str,
        message: str,
        data: T | None = None,
    ) -> ClinkrExit[T]:
        return cls(
            status=ExitStatus.FAILURE,
            error_type=error_type,
            message=message,
            data=data,
        )

    @property
    def exit_code(self) -> int:
        return self.status.value

    def to_envelope_dict(self) -> dict[str, Any]:
        envelope: dict[str, Any] = {"exit_code": self.exit_code}
        if self.error_type is not None:
            envelope["error_type"] = self.error_type
        if self.message is not None:
            envelope["message"] = self.message
        if self.data is not None:
            envelope["data"] = serialize_to_json_dict(self.data)
        return envelope
