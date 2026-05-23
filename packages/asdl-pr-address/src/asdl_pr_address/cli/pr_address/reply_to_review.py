"""Reply to a PR-level review using canonical pr-address formatting."""

from __future__ import annotations

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRDiscussionComment
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_pr_address.cli.pr_address.reply_formatting import format_review_reply


class ReplyToReviewRequest(ClinkrModel):
    pr_number: int
    review_author: str
    summary_markdown: str


class ReplyToReviewResult(ClinkrModel):
    body: str
    comment: PRDiscussionComment


@clinkr_operation(
    name="reply-to-review",
    help="Post a formatted reply to a PR-level review.",
)
def run_reply_to_review(
    ctx: click.Context,
    request: ReplyToReviewRequest,
) -> ClinkrExit[ReplyToReviewResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    normalized_summary = Ensure.truthy(
        request.summary_markdown.strip(),
        error_type="invalid_request",
        message="summary_markdown must not be empty",
    )

    body = format_review_reply(
        review_author=request.review_author,
        summary_markdown=normalized_summary,
    )

    comment = pr_address_context.pr_gateway.add_pr_discussion_comment(request.pr_number, body)
    return ClinkrExit.ok(ReplyToReviewResult(body=body, comment=comment))
