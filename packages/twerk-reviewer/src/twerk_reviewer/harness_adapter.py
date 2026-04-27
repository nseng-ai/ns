"""Harness adapter: turns a review request into a harness-specific invocation."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from twerk_reviewer.models import ReviewerFailure, ReviewExecutionRequest, ReviewExecutionResponse


def _no_event_description(_line: str) -> str | None:
    return None


@dataclass(frozen=True)
class HarnessAdapter:
    """Description of how to drive one harness (e.g. Claude Code) for reviews.

    Adapters are pure data + pure callables. ``build_argv`` receives the full
    ``ReviewExecutionRequest`` so it can decide which harness-specific flags
    (system prompt, JSON schema, output format, etc.) to set per run.
    ``build_stdin`` optionally returns a payload to feed to the harness on
    stdin; this exists because large prompts (e.g. an inlined diff) can blow
    past the kernel's ``ARG_MAX`` if passed on argv. ``parse_stdout`` turns
    the harness's captured stdout back into a structured payload (findings
    or prose). ``describe_event`` optionally maps a single streamed stdout
    line to a short human-readable progress string. All I/O lives in the
    execution gateway.
    """

    name: str
    binary: str
    build_argv: Callable[[ReviewExecutionRequest], list[str]]
    parse_stdout: Callable[[ReviewExecutionRequest, str], ReviewExecutionResponse | ReviewerFailure]
    supports_model: Callable[[str], bool]
    describe_event: Callable[[str], str | None] = field(default=_no_event_description)
    build_stdin: Callable[[ReviewExecutionRequest], str | None] = field(
        default=lambda _request: None
    )
