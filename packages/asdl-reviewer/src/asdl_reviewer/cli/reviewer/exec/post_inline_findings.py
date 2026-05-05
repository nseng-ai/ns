"""Post inline PR review comments for reviewer findings."""

from __future__ import annotations

import dataclasses
import hashlib
import sys
from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRInlineCommentInput
from asdl_reviewer.cli.reviewer.exec.format_findings_comment import (
    FindingRow,
    parse_findings_payload_result,
)
from asdl_reviewer.context import ReviewerCliContext
from asdl_reviewer.inline_commentability import FallbackOnlyFinding, classify_inline_findings

_BOT_AUTHOR_LOGIN = "github-actions[bot]"
_MARKER_PREFIX = "asdl-reviewer-inline"


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

    issue_gateway = load_typed_context(ctx, ReviewerCliContext).issue_gateway
    changed_files = issue_gateway.get_pr_changed_files(request.pr_number)
    classification = classify_inline_findings(payload.findings, changed_files)

    existing_markers = {
        marker
        for comment in issue_gateway.get_pr_review_comments(request.pr_number)
        if comment.author == _BOT_AUTHOR_LOGIN
        for marker in _extract_inline_markers(comment.body)
    }

    comments: list[PRInlineCommentInput] = []
    skipped_duplicate_count = 0
    for inlineable in classification.inlineable:
        marker = _marker_for_finding(payload.review_name, inlineable.finding)
        if marker in existing_markers:
            skipped_duplicate_count += 1
            continue
        comments.append(
            PRInlineCommentInput(
                path=inlineable.target.path,
                line=inlineable.target.line,
                body=_render_inline_body(marker, inlineable.finding),
            )
        )

    api_error: str | None = None
    posted_count = 0
    if comments:
        try:
            issue_gateway.create_pr_review(request.pr_number, tuple(comments))
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


def _marker_for_finding(review_name: str, finding: FindingRow) -> str:
    digest_input = "\0".join(
        (
            review_name,
            finding.path,
            "" if finding.line is None else str(finding.line),
            finding.severity,
            finding.summary,
            finding.details,
        )
    )
    digest = hashlib.sha256(digest_input.encode("utf-8")).hexdigest()[:16]
    return f"<!-- {_MARKER_PREFIX}:{review_name}:{digest} -->"


def _render_inline_body(marker: str, finding: FindingRow) -> str:
    return "\n".join(
        [
            marker,
            f"**{finding.severity}: {finding.summary}**",
            "",
            finding.details,
            "",
            "_Posted by asdl-reviewer. Re-running may skip this comment by marker._",
        ]
    )


def _extract_inline_markers(body: str) -> tuple[str, ...]:
    markers: list[str] = []
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith(f"<!-- {_MARKER_PREFIX}:") and stripped.endswith(" -->"):
            markers.append(stripped)
    return tuple(markers)


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
