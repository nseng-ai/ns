"""Canonical reply-body formatting for the composite pr-address commands."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Final, Literal, TypeVar, get_args

from asdl_pr_address.cli.pr_address.resolution_provenance import ResolutionProvenance

ResolutionReplyMode = Literal["fixed", "pre_existing", "explained", "planned"]
VALID_RESOLUTION_MODES: Final[tuple[str, ...]] = get_args(ResolutionReplyMode)

RESOLUTION_MARKER: Final[str] = "<!-- pr-address:resolved -->"
PRE_EXISTING_REPLY: Final[str] = (
    "Pre-existing issue - this code was moved/restructured, not newly introduced."
)
T = TypeVar("T")


def valid_resolution_modes_text() -> str:
    return ", ".join(VALID_RESOLUTION_MODES)


def format_resolution_reply(
    *,
    mode: ResolutionReplyMode,
    message: str | None,
    commit_sha: str | None,
    provenance: ResolutionProvenance | None = None,
) -> str:
    """Format the reply body for an inline review thread resolution.

    Callers must validate inputs before invoking this helper:

    - mode="fixed" requires non-empty ``message`` and ``commit_sha``.
    - mode="explained" requires non-empty ``message``.
    - mode="pre_existing" ignores ``message``, ``commit_sha``, and ``provenance``.
    - mode="planned" requires non-empty ``message`` and validated ``provenance``.

    Values are used verbatim; no trimming or validation is performed here.
    """
    summary = _resolution_summary(
        mode=mode,
        message=message,
        commit_sha=commit_sha,
        provenance=provenance,
    )
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
    provenance: ResolutionProvenance | None = None,
) -> str:
    if mode == "pre_existing":
        return PRE_EXISTING_REPLY
    if mode == "fixed":
        return f"Fixed in commit {commit_sha}: {message}"
    if mode == "explained":
        return f"{message}"
    if mode == "planned":
        if provenance is None:
            raise ValueError("mode='planned' requires validated provenance")
        return _planned_resolution_summary(message=message, provenance=provenance)
    raise ValueError(
        f"Unsupported resolution mode: {mode}. Valid modes: {valid_resolution_modes_text()}"
    )


def _planned_resolution_summary(*, message: str | None, provenance: ResolutionProvenance) -> str:
    if message is None:
        raise ValueError("mode='planned' requires a non-empty message")
    lines = [f"Planned follow-up: {message}", "", "Provenance:"]
    if provenance.kind == "local_branch":
        branch = _required_provenance_field(
            provenance.branch,
            field_name="branch",
            kind=provenance.kind,
        )
        lines.append(f"- Local branch: `{branch}`")
        if provenance.branch_head_oid is not None:
            lines.append(f"- Branch HEAD: `{provenance.branch_head_oid}`")
        return "\n".join(lines)
    if provenance.kind == "pr":
        pr_number = _required_provenance_field(
            provenance.pr_number,
            field_name="pr_number",
            kind=provenance.kind,
        )
        pr_url = _required_provenance_field(
            provenance.pr_url,
            field_name="pr_url",
            kind=provenance.kind,
        )
        pr_state = _required_provenance_field(
            provenance.pr_state,
            field_name="pr_state",
            kind=provenance.kind,
        )
        pr_head_ref_name = _required_provenance_field(
            provenance.pr_head_ref_name,
            field_name="pr_head_ref_name",
            kind=provenance.kind,
        )
        lines.append(f"- PR: #{pr_number} {pr_url}")
        lines.append(f"- PR state: {pr_state}")
        if provenance.pr_head_ref_oid is not None:
            lines.append(f"- PR head: `{pr_head_ref_name}` at `{provenance.pr_head_ref_oid}`")
        else:
            lines.append(f"- PR head: `{pr_head_ref_name}`")
        return "\n".join(lines)
    raise ValueError(f"Unsupported provenance kind: {provenance.kind}")


def _required_provenance_field(
    value: T | None,
    *,
    field_name: str,
    kind: str,
) -> T:
    if value is None:
        raise ValueError(f"kind='{kind}' provenance requires {field_name}")
    return value


def _quote_lines(text: str) -> tuple[str, ...]:
    lines = text.splitlines()
    if not lines:
        return (">",)
    return tuple("> " if not line else f"> {line}" for line in lines)


def _utc_timestamp() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
