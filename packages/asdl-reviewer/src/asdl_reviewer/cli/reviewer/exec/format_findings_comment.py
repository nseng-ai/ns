"""Render a reviewer findings JSON blob as a PR-ready Markdown comment.

Consumed by the reviewer CI workflow: `reviewer json review run` emits a
machine-readable blob on stdout; this command turns that blob into the
Markdown body posted via `gh pr comment`.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TypeAlias

import click

_SEVERITY_LABELS: dict[str, str] = {
    "error": "⛔ error",
    "warning": "⚠️ warning",
    "info": "ℹ️ info",
}

_FOOTER = "_Post-only steelthread: this comment never blocks the check._"


@dataclass(frozen=True)
class FindingsPayloadParseError:
    """Non-ideal parse result for malformed findings JSON input."""

    message: str
    error_type: str = "findings_parse_failed"


@dataclass(frozen=True)
class InlinePostingStatusParseError:
    """Non-ideal parse result for malformed inline-posting JSON input."""

    message: str
    error_type: str = "inline_posting_parse_failed"


@dataclass(frozen=True)
class FindingRow:
    path: str
    line: int | None
    severity: str
    summary: str
    details: str


@dataclass(frozen=True)
class FindingsPayload:
    review_name: str
    base_ref: str
    count: int
    findings: tuple[FindingRow, ...]
    error_type: str | None = None
    error_message: str | None = None

    @property
    def is_error(self) -> bool:
        return self.error_type is not None


@dataclass(frozen=True)
class InlinePostingStatus:
    posted_count: int
    skipped_duplicate_count: int
    fallback_only_count: int
    api_error: str | None = None


FindingsPayloadParseResult: TypeAlias = FindingsPayload | FindingsPayloadParseError
InlinePostingStatusParseResult: TypeAlias = InlinePostingStatus | InlinePostingStatusParseError


def parse_findings_payload_result(raw: str) -> FindingsPayloadParseResult:
    """Parse a reviewer clinkr envelope, returning a payload or error object."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        return FindingsPayloadParseError(message=f"input is not valid JSON: {exc}")

    if not isinstance(data, dict):
        return FindingsPayloadParseError(
            message=f"expected a JSON object at top level, got {type(data).__name__}"
        )

    if "exit_code" not in data:
        return FindingsPayloadParseError(
            message="expected a clinkr envelope with top-level 'exit_code'"
        )

    exit_code = data.get("exit_code")
    if exit_code != 0:
        return FindingsPayload(
            review_name="unknown",
            base_ref="unknown",
            count=0,
            findings=(),
            error_type=_coerce_str(data.get("error_type"), default="unknown"),
            error_message=_coerce_str(data.get("message"), default=""),
        )

    inner = data.get("data")
    if not isinstance(inner, dict):
        return FindingsPayloadParseError(message="`data` must be an object when `exit_code` is 0")

    review_name = _coerce_str(inner.get("review_name"), default="unknown")
    base_ref = _coerce_str(inner.get("base_ref"), default="unknown")

    raw_findings = inner.get("findings") or []
    if not isinstance(raw_findings, list):
        return FindingsPayloadParseError(message="`findings` must be a list when present")

    findings: list[FindingRow] = []
    for index, item in enumerate(raw_findings):
        parsed_finding = _parse_finding_result(item, index=index)
        if isinstance(parsed_finding, FindingsPayloadParseError):
            return parsed_finding
        findings.append(parsed_finding)

    count = inner.get("count")
    if not isinstance(count, int):
        count = len(findings)

    return FindingsPayload(
        review_name=review_name,
        base_ref=base_ref,
        count=count,
        findings=tuple(findings),
    )


def parse_inline_posting_status_result(raw: str) -> InlinePostingStatusParseResult:
    """Parse JSON emitted by ``reviewer exec post-inline-findings``."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        return InlinePostingStatusParseError(message=f"inline result is not valid JSON: {exc}")

    if not isinstance(data, dict):
        return InlinePostingStatusParseError(
            message=f"expected inline result JSON object, got {type(data).__name__}"
        )

    status_data: Any = data
    if "data" in data:
        status_data = data["data"]
        if not isinstance(status_data, dict):
            return InlinePostingStatusParseError(message="inline result `data` must be an object")

    return _parse_inline_posting_status_object(status_data)


def render_findings_comment(
    payload: FindingsPayload,
    *,
    inline_status: InlinePostingStatus | None = None,
) -> str:
    """Render the payload as a Markdown comment body."""
    marker = f"<!-- asdl-reviewer:{payload.review_name} -->"
    heading = f"## asdl-reviewer · `{payload.review_name}`"
    lines: list[str] = [marker, heading, ""]

    if inline_status is not None:
        lines.extend(_render_inline_posting_status(inline_status))
        lines.append("")

    if payload.is_error:
        lines.extend(_render_error_body(payload))
    elif payload.count == 0:
        lines.append(f"**No findings** against base `{payload.base_ref}`. ✅")
    else:
        lines.extend(_render_findings_body(payload))

    return "\n".join(lines)


def _render_inline_posting_status(status: InlinePostingStatus) -> list[str]:
    lines = [
        "### Inline posting",
        "",
        f"- **Inline comments posted:** {status.posted_count}",
        f"- **Duplicate inline comments skipped:** {status.skipped_duplicate_count}",
        f"- **Summary-only findings:** {status.fallback_only_count}",
    ]
    if status.api_error is not None:
        lines.append(f"- **API error:** {status.api_error}")
    return lines


def _render_error_body(payload: FindingsPayload) -> list[str]:
    return [
        f"**Reviewer failed** against base `{payload.base_ref}`. ⚠️",
        "",
        f"- **Error type:** `{payload.error_type}`",
        f"- **Message:** {payload.error_message or '(none)'}",
    ]


def _render_findings_body(payload: FindingsPayload) -> list[str]:
    noun = "finding" if payload.count == 1 else "findings"
    body: list[str] = [
        f"**{payload.count} {noun}** against base `{payload.base_ref}`.",
        "",
        "| Severity | File | Line | Summary |",
        "| --- | --- | --- | --- |",
    ]
    body.extend(
        f"| {_severity_label(f.severity)} | `{f.path}` | {_line_display(f.line)} | {f.summary} |"
        for f in payload.findings
    )
    body.extend(["", "<details>", "<summary>Details</summary>", ""])
    for finding in payload.findings:
        location = finding.path if finding.line is None else f"{finding.path}:{finding.line}"
        body.extend(
            [
                f"### `{location}` — {finding.severity}",
                f"**{finding.summary}**",
                "",
                finding.details,
                "",
            ]
        )
    body.extend(["</details>", "", _FOOTER])
    return body


def _severity_label(severity: str) -> str:
    return _SEVERITY_LABELS.get(severity, severity)


def _line_display(line: int | None) -> str:
    return "—" if line is None else str(line)


def _coerce_str(value: Any, *, default: str) -> str:
    if isinstance(value, str) and value:
        return value
    return default


def _parse_inline_posting_status_object(data: dict[str, Any]) -> InlinePostingStatusParseResult:
    posted_count = data.get("posted_count")
    skipped_duplicate_count = data.get("skipped_duplicate_count")
    fallback_only_count = data.get("fallback_only_count")
    api_error = data.get("api_error")

    if not isinstance(posted_count, int):
        return InlinePostingStatusParseError(message="inline result missing integer `posted_count`")
    if not isinstance(skipped_duplicate_count, int):
        return InlinePostingStatusParseError(
            message="inline result missing integer `skipped_duplicate_count`"
        )
    if not isinstance(fallback_only_count, int):
        return InlinePostingStatusParseError(
            message="inline result missing integer `fallback_only_count`"
        )
    if api_error is not None and not isinstance(api_error, str):
        return InlinePostingStatusParseError(
            message="inline result `api_error` must be a string or null"
        )

    return InlinePostingStatus(
        posted_count=posted_count,
        skipped_duplicate_count=skipped_duplicate_count,
        fallback_only_count=fallback_only_count,
        api_error=api_error,
    )


def _parse_finding_result(item: Any, *, index: int) -> FindingRow | FindingsPayloadParseError:
    if not isinstance(item, dict):
        return FindingsPayloadParseError(message=f"finding #{index} is not an object")

    path = item.get("path")
    summary = item.get("summary")
    details = item.get("details")
    severity = item.get("severity")
    line = item.get("line")

    if not isinstance(path, str) or not path:
        return FindingsPayloadParseError(message=f"finding #{index} is missing a string `path`")
    if not isinstance(summary, str):
        return FindingsPayloadParseError(message=f"finding #{index} is missing a string `summary`")
    if not isinstance(details, str):
        return FindingsPayloadParseError(message=f"finding #{index} is missing a string `details`")
    if not isinstance(severity, str):
        return FindingsPayloadParseError(message=f"finding #{index} is missing a string `severity`")
    if line is not None and not isinstance(line, int):
        return FindingsPayloadParseError(message=f"finding #{index} has non-integer `line`")

    return FindingRow(
        path=path,
        line=line,
        severity=severity,
        summary=summary,
        details=details,
    )


@click.command(
    name="format-findings-comment",
    help=(
        "Render a reviewer findings JSON blob (from stdin) as a PR-ready "
        "Markdown comment on stdout."
    ),
)
@click.option(
    "--inline-result-file",
    type=click.Path(path_type=Path, exists=True, dir_okay=False, readable=True),
    help="JSON result file from reviewer exec post-inline-findings.",
)
def format_findings_comment_command(inline_result_file: Path | None) -> None:
    raw = sys.stdin.read()
    payload = parse_findings_payload_result(raw)
    if isinstance(payload, FindingsPayloadParseError):
        click.echo(f"format-findings-comment: {payload.message}", err=True)
        sys.exit(1)

    inline_status: InlinePostingStatus | None = None
    if inline_result_file is not None:
        inline_result = parse_inline_posting_status_result(
            inline_result_file.read_text(encoding="utf-8")
        )
        if isinstance(inline_result, InlinePostingStatusParseError):
            click.echo(f"format-findings-comment: {inline_result.message}", err=True)
            sys.exit(1)
        inline_status = inline_result

    click.echo(render_findings_comment(payload, inline_status=inline_status))
