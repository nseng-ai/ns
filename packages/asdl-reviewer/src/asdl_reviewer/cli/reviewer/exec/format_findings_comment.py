"""Render a reviewer findings JSON blob as a PR-ready Markdown comment.

Consumed by the reviewer CI workflow: `reviewer json review run` emits a
machine-readable blob on stdout; this command turns that blob into the
Markdown body posted via `gh pr comment`.
"""

from __future__ import annotations

import sys
from pathlib import Path

import click

from asdl_reviewer.findings_publication import (
    FindingsPayloadParseError,
    InlinePostingStatus,
    InlinePostingStatusParseError,
    parse_findings_payload_result,
    parse_inline_posting_status_result,
    render_findings_comment,
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
