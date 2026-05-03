from __future__ import annotations

from enum import Enum
from typing import Any, Generic, TypeVar

from asdl_core.clinkr.dataclass_json import JsonSerializable, serialize_to_json_dict

T = TypeVar("T", bound=JsonSerializable)


class ExitStatus(Enum):
    OK = 0
    NEGATIVE = 1
    FAILURE = 2


class ClinkrExit(Exception, Generic[T]):
    """CLI exit envelope returned by `@clinkr_operation` functions.

    Construct only inside the dispatcher and on the `ok` / `negative` return
    paths inside operation bodies. For failures, raise `ClinkrFailure` instead
    of constructing `ClinkrExit.failure(...)` directly — the dispatcher
    converts the raised `ClinkrFailure` into the failure envelope at the CLI
    boundary. For precondition guards, use the helpers on `Ensure`.
    """

    def __init__(
        self,
        *,
        status: ExitStatus,
        data: T | None = None,
        message: str | None = None,
        error_type: str | None = None,
    ) -> None:
        if status is ExitStatus.OK:
            if message is not None or error_type is not None:
                raise ValueError("ClinkrExit.ok must not carry message or error_type")
        elif status is ExitStatus.NEGATIVE:
            if message is None:
                raise ValueError("ClinkrExit.negative requires a message")
            if error_type is not None:
                raise ValueError("ClinkrExit.negative must not carry an error_type")
        elif status is ExitStatus.FAILURE:
            if message is None or error_type is None:
                raise ValueError("ClinkrExit.failure requires both error_type and message")
            if data is not None:
                raise ValueError("ClinkrExit.failure must not carry data")

        super().__init__(message or error_type or "")
        self.status = status
        self.data = data
        self.message = message
        self.error_type = error_type

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
    ) -> ClinkrExit[T]:
        return cls(
            status=ExitStatus.FAILURE,
            error_type=error_type,
            message=message,
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
