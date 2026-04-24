"""Render a reviewer findings JSON blob as a PR-ready Markdown comment.

Consumed by the reviewer CI workflow: `reviewer json review run` emits a
machine-readable blob on stdout; this command turns that blob into the
Markdown body posted via `gh pr comment`.
"""

from __future__ import annotations

import sys

import click

from twerk_reviewer.cli.reviewer.exec.findings_payload import (
    FindingsParseError,
    FindingsPayload,
    parse_findings_payload,
)

_SEVERITY_LABELS: dict[str, str] = {
    "error": "⛔ error",
    "warning": "⚠️ warning",
    "info": "ℹ️ info",
}

_FOOTER = "_Post-only steelthread: this comment never blocks the check._"


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
