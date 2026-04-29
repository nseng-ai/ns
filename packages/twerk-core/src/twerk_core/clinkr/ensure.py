"""`Ensure`: precondition helpers that raise `ClinkrFailure` on violation.

These helpers are the canonical idiom for guard clauses inside
`@clinkr_operation` bodies and the CLI-layer code they call. Each helper
raises `ClinkrFailure` under the hood; the dispatcher converts that into a
`ClinkrExit.failure(...)` envelope at the CLI boundary.
"""

from __future__ import annotations

from typing import NoReturn, TypeVar, cast

from twerk_core.clinkr.failure import ClinkrFailure
from twerk_core.clinkr.non_ideal_state import NonIdealState

T = TypeVar("T")


class Ensure:
    """Namespace of precondition helpers for `@clinkr_operation` bodies.

    All helpers raise `ClinkrFailure` on violation. Use these in operation
    bodies and CLI-layer helpers; do not construct `ClinkrExit.failure(...)`
    directly.
    """

    @staticmethod
    def fail(*, error_type: str, message: str) -> NoReturn:
        """Unconditionally raise `ClinkrFailure`.

        Use as the terminator of an exhaustive `isinstance` / `match` chain
        where the failure arms have already been handled, or anywhere a
        guard has already proven the failure case. Returns `NoReturn` so
        type checkers narrow the union past this call.
        """
        raise ClinkrFailure(error_type=error_type, message=message)

    @staticmethod
    def true(condition: bool, *, error_type: str, message: str) -> None:
        """Raise `ClinkrFailure` unless `condition` is true.

        Generic precondition for boolean guards: equality, inequality,
        membership, mutually-exclusive flag combinations, etc.
        """
        if not condition:
            raise ClinkrFailure(error_type=error_type, message=message)

    @staticmethod
    def truthy(value: T, *, error_type: str, message: str) -> T:
        """Raise `ClinkrFailure` unless `value` is truthy; return `value`.

        Useful for non-empty / non-zero guards where the value is consumed
        downstream and rebinding the same name is convenient.
        """
        if not value:
            raise ClinkrFailure(error_type=error_type, message=message)
        return value

    @staticmethod
    def not_none(value: T | None, *, error_type: str, message: str) -> T:
        """Return `value` if non-None; otherwise raise `ClinkrFailure`.

        Type-narrowing variant of `true` for `T | None` guards: assigning
        the return value back to the binding gives type checkers a `T`
        rather than `T | None`, so no follow-up `assert` is needed.
        """
        if value is None:
            raise ClinkrFailure(error_type=error_type, message=message)
        return value

    @staticmethod
    def inst(value: object, type_: type[T], *, error_type: str, message: str) -> T:
        """Return `value` narrowed to `type_`; otherwise raise `ClinkrFailure`.

        Type-narrowing variant for sum-type guards where the success arm is
        a known concrete type (e.g. `not isinstance(envelope, dict): raise`).
        """
        if not isinstance(value, type_):
            raise ClinkrFailure(error_type=error_type, message=message)
        return value

    @staticmethod
    def ideal_state(value: T | NonIdealState) -> T:
        """Narrow `value` away from `NonIdealState`; return the ideal arm.

        When `value` is a non-ideal-state failure, raise `ClinkrFailure`
        carrying the failure's own `error_type` and `message`. When `value`
        is the ideal arm of the union, return it unchanged.

        Use this to collapse domain-failure match blocks at the CLI
        boundary when every failure arm of the union implements
        `NonIdealState`.
        """
        if isinstance(value, NonIdealState):
            raise ClinkrFailure(error_type=value.error_type, message=value.message)
        return cast(T, value)
