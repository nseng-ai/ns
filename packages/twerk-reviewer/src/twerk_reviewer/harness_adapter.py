"""Harness adapter: turns a review request into a harness-specific invocation."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from twerk_reviewer.models import ReviewerFailure, ReviewExecutionResponse


@dataclass(frozen=True)
class HarnessAdapter:
    """Description of how to drive one harness (e.g. Claude Code) for reviews.

    Adapters are pure data + pure callables. They know how to turn a
    ``(model, prompt)`` pair into argv and how to parse the harness's stdout
    back into structured findings. All I/O lives in the execution gateway.
    """

    name: str
    binary: str
    build_argv: Callable[[str, str], list[str]]
    parse_stdout: Callable[[str], ReviewExecutionResponse | ReviewerFailure]
    supports_model: Callable[[str], bool]
