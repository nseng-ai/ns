"""Post inline PR review comments for reviewer findings."""

from __future__ import annotations

import dataclasses
import sys
from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRInlineCommentInput
from roaster.context import ReviewerCliContext
from roaster.findings_publication import (
    extract_inline_markers,
    inline_marker_for_finding,
    parse_findings_payload_result,
    render_inline_body,
)
from roaster.inline_commentability import FallbackOnlyFinding, classify_inline_findings

_BOT_AUTHOR_LOGIN = "github-actions[bot]"


class PostInlineFindingsRequest(ClinkrModel):
    pr_number: Annotated[
        int,
        click.Option(
            ["--pr-number"],
            required=True,
            help="PR number to post inline findings against.",
        ),
    ]


class PostInlineFindingsResult(ClinkrModel):
    posted_count: int
    skipped_duplicate_count: int
    fallback_only_count: int
    fallback_only: tuple[dict[str, object], ...]
    api_error: str | None = None


@clinkr_operation(
    name="post-inline-findings",
    help="Post inline PR review comments for commentable reviewer findings from stdin.",
)
def post_inline_findings_command(
    ctx: click.Context,
    request: PostInlineFindingsRequest,
) -> ClinkrExit[PostInlineFindingsResult]:
    raw = sys.stdin.read()
    payload = Ensure.ideal_state(parse_findings_payload_result(raw))

    pr_gateway = load_typed_context(ctx, ReviewerCliContext).pr_gateway
    changed_files = pr_gateway.get_pr_changed_files(request.pr_number)
    classification = classify_inline_findings(payload.findings, changed_files)

    existing_markers = {
        marker
        for comment in pr_gateway.get_pr_review_comments(request.pr_number)
        if comment.author == _BOT_AUTHOR_LOGIN
        for marker in extract_inline_markers(comment.body)
    }

    comments: list[PRInlineCommentInput] = []
    skipped_duplicate_count = 0
    for inlineable in classification.inlineable:
        marker = inline_marker_for_finding(payload.review_name, inlineable.finding)
        if marker in existing_markers:
            skipped_duplicate_count += 1
            continue
        comments.append(
            PRInlineCommentInput(
                path=inlineable.target.path,
                line=inlineable.target.line,
                body=render_inline_body(marker, inlineable.finding),
            )
        )

    api_error: str | None = None
    posted_count = 0
    if comments:
        try:
            pr_gateway.create_pr_review(request.pr_number, tuple(comments))
            posted_count = len(comments)
        except Exception as exc:  # noqa: BLE001 - CLI boundary preserves fallback accounting in JSON.
            api_error = str(exc) or exc.__class__.__name__

    result = PostInlineFindingsResult(
        posted_count=posted_count,
        skipped_duplicate_count=skipped_duplicate_count,
        fallback_only_count=len(classification.fallback_only),
        fallback_only=_fallback_only_json(classification.fallback_only),
        api_error=api_error,
    )
    return ClinkrExit.ok(result)


def _fallback_only_json(items: tuple[FallbackOnlyFinding, ...]) -> tuple[dict[str, object], ...]:
    rendered: list[dict[str, object]] = []
    for item in items:
        rendered.append(
            {
                "finding": dataclasses.asdict(item.finding),
                "reason": item.reason,
            }
        )
    return tuple(rendered)
