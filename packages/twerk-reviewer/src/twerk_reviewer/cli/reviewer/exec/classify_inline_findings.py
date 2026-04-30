"""Classify reviewer findings by whether they can become PR inline comments."""

from __future__ import annotations

import json
import sys

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_reviewer.cli.reviewer.exec.format_findings_comment import (
    FindingsParseError,
    parse_findings_payload,
)
from twerk_reviewer.context import ReviewerCliContext
from twerk_reviewer.inline_commentability import classify_inline_findings, result_to_json_dict


@click.command(
    name="classify-inline-findings",
    help=(
        "Classify a reviewer findings JSON blob (from stdin) into inlineable "
        "and fallback-only groups."
    ),
)
@click.option("--pr-number", required=True, type=int, help="PR number to inspect.")
@click.pass_context
def classify_inline_findings_command(ctx: click.Context, pr_number: int) -> None:
    raw = sys.stdin.read()
    try:
        payload = parse_findings_payload(raw)
    except FindingsParseError as exc:
        click.echo(f"classify-inline-findings: {exc}", err=True)
        sys.exit(1)

    issue_gateway = load_typed_context(ctx, ReviewerCliContext).issue_gateway
    changed_files = issue_gateway.get_pr_changed_files(pr_number)
    result = classify_inline_findings(payload.findings, changed_files)
    click.echo(json.dumps(result_to_json_dict(result), sort_keys=True))
