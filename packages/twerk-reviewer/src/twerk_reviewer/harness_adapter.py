"""Harness adapter: turns a review request into a harness-specific invocation."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from twerk_reviewer.models import ReviewerFailure, ReviewExecutionResponse


def _no_event_description(_line: str) -> str | None:
    return None


@dataclass(frozen=True)
class HarnessAdapter:
    """Description of how to drive one harness (e.g. Claude Code) for reviews.

    Adapters are pure data + pure callables. They know how to turn a
    ``(model, prompt)`` pair into argv and how to parse the harness's stdout
    back into structured findings. ``describe_event`` optionally turns a single
    streamed stdout line into a short human-readable progress string, which the
    execution gateway forwards to its progress writer. All I/O lives in the
    execution gateway.
    """

    name: str
    binary: str
    build_argv: Callable[[str, str], list[str]]
    parse_stdout: Callable[[str], ReviewExecutionResponse | ReviewerFailure]
    supports_model: Callable[[str], bool]
    describe_event: Callable[[str], str | None] = field(default=_no_event_description)
