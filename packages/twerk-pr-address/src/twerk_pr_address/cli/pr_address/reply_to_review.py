"""Reply to a PR-level review using canonical pr-address formatting."""

from __future__ import annotations

from dataclasses import dataclass

import click

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import IssueComment
from twerk_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway
from twerk_pr_address.cli.pr_address.reply_formatting import format_review_reply


@dataclass(frozen=True)
class ReplyToReviewRequest:
    pr_number: int
    review_author: str
    summary_markdown: str


@dataclass(frozen=True)
class ReplyToReviewResult(JsonSerializable):
    body: str
    comment: IssueComment


@clinkr_operation(
    name="reply-to-review",
    help="Post a formatted reply to a PR-level review.",
)
def run_reply_to_review(
    ctx: click.Context,
    request: ReplyToReviewRequest,
) -> ClinkrExit[ReplyToReviewResult]:
    normalized_summary = request.summary_markdown.strip()
    if not normalized_summary:
        raise ClinkrExit.failure(
            error_type="invalid_request",
            message="summary_markdown must not be empty",
        )

    body = format_review_reply(
        review_author=request.review_author,
        summary_markdown=normalized_summary,
    )

    gateway = get_gh_issue_gateway(ctx)
    comment = gateway.add_comment(request.pr_number, body)
    return ClinkrExit.ok(ReplyToReviewResult(body=body, comment=comment))
