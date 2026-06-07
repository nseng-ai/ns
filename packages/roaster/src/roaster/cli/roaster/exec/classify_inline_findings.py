"""Classify roaster findings by whether they can become PR inline comments."""

from __future__ import annotations

import sys
from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from roaster.context import RoasterCliContext
from roaster.findings_publication import parse_publishable_diff_findings_payload_result
from roaster.inline_commentability import (
    InlineCommentabilityResult,
    classify_inline_findings,
)


class ClassifyInlineFindingsRequest(ClinkrModel):
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
        "Classify a roaster findings JSON blob (from stdin) into inlineable "
        "and fallback-only groups."
    ),
)
def classify_inline_findings_command(
    ctx: click.Context,
    request: ClassifyInlineFindingsRequest,
) -> ClinkrExit[InlineCommentabilityResult]:
    raw = sys.stdin.read()
    payload = Ensure.ideal_state(parse_publishable_diff_findings_payload_result(raw))

    pr_gateway = load_typed_context(ctx, RoasterCliContext).pr_gateway
    changed_files = pr_gateway.get_pr_changed_files(request.pr_number)
    result = classify_inline_findings(payload.findings, changed_files)
    return ClinkrExit.ok(result)
