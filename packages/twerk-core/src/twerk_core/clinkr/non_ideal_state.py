"""`NonIdealState`: structural marker for domain failures translatable to `ClinkrFailure`.

A domain sum type (e.g. `Result | Error1 | Error2`) qualifies for one-step
narrowing via `Ensure.ideal_state` when each error arm exposes a
human-readable `message`. Implementing types do not need to inherit from
this Protocol; structural conformance is enough.

The CLI translation tag (`error_type`) is derived automatically from the
class name by `error_type_for`: `ClaudeCodeInvalidJson` →
`"claude_code_invalid_json"`. A failure type that needs a different tag
(e.g. an entrenched CLI string, or a context-overridable field) can
expose an `error_type: str` attribute, which `error_type_for` honors as
an override.
"""

from __future__ import annotations

import re
from typing import Protocol, runtime_checkable


@runtime_checkable
class NonIdealState(Protocol):
    """Domain failure shape recognized by `Ensure.ideal_state`.

    Each implementing type owns its canonical CLI wording via `message`.
    The CLI translation tag is derived from the class name by
    `error_type_for`; types that need a non-derived tag can expose an
    explicit `error_type: str` attribute as an override.
    """

    @property
    def message(self) -> str: ...


def error_type_for(value: NonIdealState) -> str:
    """CLI translation tag for a `NonIdealState`.

    Defaults to `snake_case(type(value).__name__)`. A failure type that
    needs a different tag (e.g. an entrenched CLI string, or a
    context-overridable field) can expose an `error_type: str`
    attribute, which takes precedence.
    """
    explicit = getattr(value, "error_type", None)
    if isinstance(explicit, str):
        return explicit
    return re.sub(r"(?<!^)(?=[A-Z])", "_", type(value).__name__).lower()
