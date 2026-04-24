"""Publish reviewer findings as GitHub check-run annotations.

Consumed by the reviewer CI workflow: ``reviewer review run`` emits a
machine-readable clinkr envelope on stdout; this command reads the same
envelope and publishes the findings as annotations on a check run
anchored to the PR's head commit SHA.

Findings with a concrete ``line`` become line-anchored annotations in
GitHub's "Files changed" view. Findings without a line number are
rendered into the check run's ``output.text`` body so no finding is
dropped — the plan's "full visibility of all findings" invariant.
"""

from __future__ import annotations

import sys

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.gh.types import (
    AnnotationLevel,
    CheckRunAnnotation,
    CheckRunOutput,
)
from twerk_reviewer.cli.reviewer.exec.findings_payload import (
    FindingRow,
    FindingsParseError,
    FindingsPayload,
    parse_findings_payload,
)
from twerk_reviewer.context import ReviewerCliContext

# GitHub's documented field caps. Messages up to 64 KB and titles up to
# 255 chars are accepted; anything past that is truncated by the API.
# We truncate on our side so the stored content round-trips correctly.
_MESSAGE_MAX = 65535
_TITLE_MAX = 255

_SEVERITY_TO_LEVEL: dict[str, AnnotationLevel] = {
    "error": "failure",
    "warning": "warning",
    "info": "notice",
}


def severity_to_annotation_level(severity: str) -> AnnotationLevel:
    """Map a reviewer severity to a GitHub annotation_level.

    Unknown severities fall back to ``"notice"`` so a malformed finding
    never blocks the publish — degraded display is a better failure mode
    than a dropped finding (invariant #2).
    """
    return _SEVERITY_TO_LEVEL.get(severity, "notice")


def build_annotation(finding: FindingRow) -> CheckRunAnnotation:
    """Convert a finding with a concrete ``line`` into a check-run annotation.

    Callers must partition findings on ``line is None`` first; annotations
    require 1-indexed start_line and end_line.
    """
    if finding.line is None:
        raise ValueError("build_annotation requires a finding with a concrete line")
    title = finding.summary[:_TITLE_MAX] or None
    message = finding.details[:_MESSAGE_MAX] if finding.details else finding.summary[:_MESSAGE_MAX]
    return CheckRunAnnotation(
        path=finding.path,
        start_line=finding.line,
        end_line=finding.line,
        annotation_level=severity_to_annotation_level(finding.severity),
        message=message,
        title=title,
    )


def _render_file_level_section(file_level: tuple[FindingRow, ...]) -> str:
    lines: list[str] = ["## File-level findings", ""]
    for finding in file_level:
        lines.extend(
            [
                f"### `{finding.path}` — {finding.severity}",
                f"**{finding.summary}**",
                "",
                finding.details,
                "",
            ]
        )
    return "\n".join(lines)


def _render_error_section(payload: FindingsPayload) -> str:
    return "\n".join(
        [
            "## Reviewer failed",
            "",
            f"- **Error type:** `{payload.error_type}`",
            f"- **Message:** {payload.error_message or '(none)'}",
            "",
        ]
    )


def _build_output(
    *,
    review_key: str,
    payload: FindingsPayload,
    line_findings: tuple[FindingRow, ...],
    file_level: tuple[FindingRow, ...],
    run_url: str | None,
) -> CheckRunOutput:
    if payload.is_error:
        title = f"twerk-reviewer/{review_key} — reviewer failed"
    elif payload.count == 0:
        title = f"twerk-reviewer/{review_key} — no findings"
    else:
        noun = "finding" if payload.count == 1 else "findings"
        title = f"twerk-reviewer/{review_key} — {payload.count} {noun}"
    title = title[:_TITLE_MAX]

    summary_lines: list[str] = []
    if payload.is_error:
        summary_lines.append(f"Reviewer failed against base `{payload.base_ref}`.")
    elif payload.count == 0:
        summary_lines.append(f"No findings against base `{payload.base_ref}`.")
    else:
        line_count = len(line_findings)
        file_count = len(file_level)
        bits: list[str] = []
        if line_count:
            bits.append(f"{line_count} line-anchored")
        if file_count:
            bits.append(f"{file_count} file-level")
        detail = " and ".join(bits) if bits else "0"
        summary_lines.append(f"{detail} against base `{payload.base_ref}`.")
    if run_url:
        summary_lines.append(f"[CI run]({run_url})")
    summary = "\n\n".join(summary_lines)

    text_sections: list[str] = []
    if payload.is_error:
        text_sections.append(_render_error_section(payload))
    if file_level:
        text_sections.append(_render_file_level_section(file_level))
    text = "\n\n".join(text_sections) if text_sections else None

    return CheckRunOutput(title=title, summary=summary, text=text)


@click.command(
    name="post-findings-check",
    help=(
        "Publish a reviewer findings JSON blob (from stdin) as GitHub "
        "check-run annotations on the PR's head commit."
    ),
)
@click.option("--head-sha", required=True, help="Commit SHA the check run anchors to.")
@click.option(
    "--review-key",
    required=True,
    help="Reviewer key (determines the check-run name as 'twerk-reviewer/<key>').",
)
@click.option(
    "--run-url",
    default=None,
    help="Optional URL or identifier for the current CI run, surfaced in the check-run summary.",
)
@click.pass_context
def post_findings_check_command(
    ctx: click.Context,
    head_sha: str,
    review_key: str,
    run_url: str | None,
) -> None:
    raw = sys.stdin.read()
    try:
        payload = parse_findings_payload(raw)
    except FindingsParseError as exc:
        click.echo(f"post-findings-check: {exc}", err=True)
        sys.exit(1)

    check_runs = load_typed_context(ctx, ReviewerCliContext).check_runs

    line_findings = tuple(f for f in payload.findings if f.line is not None)
    file_level = tuple(f for f in payload.findings if f.line is None)

    annotations = [build_annotation(f) for f in line_findings]
    output = _build_output(
        review_key=review_key,
        payload=payload,
        line_findings=line_findings,
        file_level=file_level,
        run_url=run_url,
    )

    name = f"twerk-reviewer/{review_key}"
    result = check_runs.upsert_check_run(
        head_sha=head_sha,
        name=name,
        output=output,
        annotations=annotations,
    )
    click.echo(f"post-findings-check: check run {result.id} at {result.html_url}", err=True)
