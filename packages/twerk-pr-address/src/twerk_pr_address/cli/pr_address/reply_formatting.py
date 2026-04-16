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
    message: str | None = None,
    commit_sha: str | None = None,
) -> str:
    """Format the reply body for an inline review thread resolution."""
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
    """Format a PR-level review response comment."""
    summary = _require_text(summary_markdown, field_name="summary_markdown")
    return "\n".join(
        [
            f"Addressed review feedback from @{review_author}:",
            summary,
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
    """Format a reply to a PR discussion comment."""
    normalized_response = _require_text(response, field_name="response")
    quote_block = "\n".join(_quote_lines(original_body))
    return "\n".join(
        [
            f"> @{comment_author} wrote:",
            quote_block,
            "",
            normalized_response,
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
        normalized_message = _require_text(message, field_name="message")
        normalized_sha = _require_text(commit_sha, field_name="commit_sha")
        return f"Fixed in commit {normalized_sha}: {normalized_message}"
    if mode == "explained":
        return _require_text(message, field_name="message")
    raise ValueError(f"Unsupported resolution mode: {mode}")


def _require_text(value: str | None, *, field_name: str) -> str:
    if value is None:
        raise ValueError(f"{field_name} is required")
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} must not be empty")
    return normalized


def _quote_lines(text: str) -> tuple[str, ...]:
    lines = text.splitlines()
    if not lines:
        return (">",)
    return tuple("> " if not line else f"> {line}" for line in lines)


def _utc_timestamp() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
