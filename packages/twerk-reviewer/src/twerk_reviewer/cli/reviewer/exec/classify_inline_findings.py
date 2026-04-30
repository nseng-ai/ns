"""Classify reviewer findings by whether they can become PR inline comments."""

from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Annotated

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.ensure import Ensure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_reviewer.cli.reviewer.exec.format_findings_comment import parse_findings_payload_result
from twerk_reviewer.context import ReviewerCliContext
from twerk_reviewer.inline_commentability import (
    InlineCommentabilityResult,
    classify_inline_findings,
)


@dataclass(frozen=True)
class ClassifyInlineFindingsRequest:
    pr_number: Annotated[
        int,
        click.Option(
            ["--pr-number"],
            required=True,
            help="PR number to inspect.",
        ),
    ]


@clinkr_operation(
    name="classify-inline-findings",
    help=(
        "Classify a reviewer findings JSON blob (from stdin) into inlineable "
        "and fallback-only groups."
    ),
)
def classify_inline_findings_command(
    ctx: click.Context,
    request: ClassifyInlineFindingsRequest,
) -> ClinkrExit[InlineCommentabilityResult]:
    raw = sys.stdin.read()
    payload = Ensure.ideal_state(parse_findings_payload_result(raw))

    issue_gateway = load_typed_context(ctx, ReviewerCliContext).issue_gateway
    changed_files = issue_gateway.get_pr_changed_files(request.pr_number)
    result = classify_inline_findings(payload.findings, changed_files)
    return ClinkrExit.ok(result)
