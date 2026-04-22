"""Render a reviewer findings JSON blob as a PR-ready Markdown comment.

Consumed by the reviewer CI workflow: `reviewer json review run` emits a
machine-readable blob on stdout; this command turns that blob into the
Markdown body posted via `gh pr comment`.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from typing import Any

import click

_SEVERITY_LABELS: dict[str, str] = {
    "error": "⛔ error",
    "warning": "⚠️ warning",
    "info": "ℹ️ info",
}

_FOOTER = "_Post-only steelthread: this comment never blocks the check._"


class FindingsParseError(ValueError):
    """The findings JSON payload could not be parsed."""


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


def parse_findings_payload(raw: str) -> FindingsPayload:
    """Parse a reviewer clinkr envelope into a normalized findings payload.

    Expects a top-level JSON object carrying `exit_code` (the clinkr envelope
    shape). On `exit_code == 0` the `data` object is unwrapped and its flat
    fields (`review_name`, `base_ref`, `findings`, `count`) are parsed. On any
    non-zero `exit_code` the envelope's `error_type` / `message` are surfaced
    as an error payload.
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise FindingsParseError(f"input is not valid JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise FindingsParseError(f"expected a JSON object at top level, got {type(data).__name__}")

    if "exit_code" not in data:
        raise FindingsParseError("expected a clinkr envelope with top-level 'exit_code'")

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
        raise FindingsParseError("`data` must be an object when `exit_code` is 0")

    review_name = _coerce_str(inner.get("review_name"), default="unknown")
    base_ref = _coerce_str(inner.get("base_ref"), default="unknown")

    raw_findings = inner.get("findings") or []
    if not isinstance(raw_findings, list):
        raise FindingsParseError("`findings` must be a list when present")

    findings = tuple(_parse_finding(item, index=i) for i, item in enumerate(raw_findings))
    count = inner.get("count")
    if not isinstance(count, int):
        count = len(findings)

    return FindingsPayload(
        review_name=review_name,
        base_ref=base_ref,
        count=count,
        findings=findings,
    )


def render_findings_comment(payload: FindingsPayload) -> str:
    """Render the payload as a Markdown comment body."""
    marker = f"<!-- twerk-reviewer:{payload.review_name} -->"
    heading = f"## twerk-reviewer · `{payload.review_name}`"
    lines: list[str] = [marker, heading, ""]

    if payload.is_error:
        lines.extend(_render_error_body(payload))
    elif payload.count == 0:
        lines.append(f"**No findings** against base `{payload.base_ref}`. ✅")
    else:
        lines.extend(_render_findings_body(payload))

    return "\n".join(lines)


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


def _parse_finding(item: Any, *, index: int) -> FindingRow:
    if not isinstance(item, dict):
        raise FindingsParseError(f"finding #{index} is not an object")

    path = item.get("path")
    summary = item.get("summary")
    details = item.get("details")
    severity = item.get("severity")
    line = item.get("line")

    if not isinstance(path, str) or not path:
        raise FindingsParseError(f"finding #{index} is missing a string `path`")
    if not isinstance(summary, str):
        raise FindingsParseError(f"finding #{index} is missing a string `summary`")
    if not isinstance(details, str):
        raise FindingsParseError(f"finding #{index} is missing a string `details`")
    if not isinstance(severity, str):
        raise FindingsParseError(f"finding #{index} is missing a string `severity`")
    if line is not None and not isinstance(line, int):
        raise FindingsParseError(f"finding #{index} has non-integer `line`")

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
def format_findings_comment_command() -> None:
    raw = sys.stdin.read()
    try:
        payload = parse_findings_payload(raw)
    except FindingsParseError as exc:
        click.echo(f"format-findings-comment: {exc}", err=True)
        sys.exit(1)
    click.echo(render_findings_comment(payload))
