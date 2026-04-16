"""Canonical reply-body formatting for the composite pr-address commands."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Final, Literal

ResolutionReplyMode = Literal["fixed", "pre_existing", "explained"]

RESOLUTION_MARKER: Final[str] = "<!-- pr-address:resolved -->"
PRE_EXISTING_REPLY: Final[str] = (
    "Pre-existing issue - this code was moved/restructured, not newly introduced."
)


def format_resolution_reply(
    *,
    mode: ResolutionReplyMode,
    message: str | None,
    commit_sha: str | None,
) -> str:
    """Format the reply body for an inline review thread resolution.

    Callers must validate inputs before invoking this helper:

    - mode="fixed" requires non-empty ``message`` and ``commit_sha``.
    - mode="explained" requires non-empty ``message``.
    - mode="pre_existing" ignores ``message`` and ``commit_sha``.

    Values are used verbatim; no trimming or validation is performed here.
    """
    summary = _resolution_summary(mode=mode, message=message, commit_sha=commit_sha)
    return "\n".join(
        [
            summary,
            "",
            f"Addressed via _pr-address_ at {_utc_timestamp()}",
            RESOLUTION_MARKER,
        ]
    )


def format_review_reply(*, review_author: str, summary_markdown: str) -> str:
    """Format a PR-level review response comment.

    Callers must pass a non-empty, already-trimmed ``summary_markdown``.
    """
    return "\n".join(
        [
            f"Addressed review feedback from @{review_author}:",
            summary_markdown,
            "",
            f"_Addressed via pr-address at {_utc_timestamp()}_",
        ]
    )


def format_discussion_reply(
    *,
    comment_author: str,
    original_body: str,
    response: str,
) -> str:
    """Format a reply to a PR discussion comment.

    Callers must pass a non-empty, already-trimmed ``response``.
    """
    quote_block = "\n".join(_quote_lines(original_body))
    return "\n".join(
        [
            f"> @{comment_author} wrote:",
            quote_block,
            "",
            response,
            "",
            f"_Addressed via pr-address at {_utc_timestamp()}_",
        ]
    )


def _resolution_summary(
    *,
    mode: ResolutionReplyMode,
    message: str | None,
    commit_sha: str | None,
) -> str:
    if mode == "pre_existing":
        return PRE_EXISTING_REPLY
    if mode == "fixed":
        return f"Fixed in commit {commit_sha}: {message}"
    if mode == "explained":
        return f"{message}"
    raise ValueError(f"Unsupported resolution mode: {mode}")


def _quote_lines(text: str) -> tuple[str, ...]:
    lines = text.splitlines()
    if not lines:
        return (">",)
    return tuple("> " if not line else f"> {line}" for line in lines)


def _utc_timestamp() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
