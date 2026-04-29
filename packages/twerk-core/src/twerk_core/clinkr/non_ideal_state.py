"""`NonIdealState`: structural marker for domain failures translatable to `ClinkrFailure`.

A domain sum type (e.g. `Result | Error1 | Error2`) qualifies for one-step
narrowing via `Ensure.ideal_state` when each error arm exposes a CLI-ready
`error_type` and `message`. Implementing types do not need to inherit from
this Protocol; structural conformance is enough.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class NonIdealState(Protocol):
    """Domain failure shape recognized by `Ensure.ideal_state`.

    Each implementing type owns its canonical CLI translation: `error_type`
    is the stable machine-readable tag, `message` is the human-readable
    sentence. Implementations may expose them as dataclass fields or as
    `@property` methods.
    """

    @property
    def error_type(self) -> str: ...

    @property
    def message(self) -> str: ...
