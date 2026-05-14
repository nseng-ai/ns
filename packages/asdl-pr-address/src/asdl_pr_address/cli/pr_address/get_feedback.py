"""Fetch all PR feedback (reviews, threads, discussion comments) in a single batch."""

import dataclasses
from typing import Any

import click
from pydantic import model_serializer

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import IssueComment, PRReview, PRReviewThread
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_pr_address.cli.pr_address.review_filtering import filter_empty_reviews


class GetFeedbackRequest(ClinkrModel):
    pr_number: int
    include_resolved: bool = False
    include_empty_reviews: bool = False


class GetFeedbackResult(ClinkrModel):
    pr_number: int
    reviews: tuple[PRReview, ...]
    review_threads: tuple[PRReviewThread, ...]
    discussion_comments: tuple[IssueComment, ...]

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        return {
            "pr_number": self.pr_number,
            "reviews": [dataclasses.asdict(r) for r in self.reviews],
            "review_threads": [dataclasses.asdict(t) for t in self.review_threads],
            "discussion_comments": [dataclasses.asdict(c) for c in self.discussion_comments],
        }


@clinkr_operation(
    name="get-feedback",
    help="Fetch all PR feedback (reviews, threads, discussion comments) in a single batch.",
)
def run_get_feedback(
    ctx: click.Context,
    request: GetFeedbackRequest,
) -> ClinkrExit[GetFeedbackResult]:
    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    raw_reviews = pr_address_context.gh_issue_gateway.get_reviews(request.pr_number)
    reviews = raw_reviews if request.include_empty_reviews else filter_empty_reviews(raw_reviews)
    return ClinkrExit.ok(
        GetFeedbackResult(
            pr_number=request.pr_number,
            reviews=reviews,
            review_threads=pr_address_context.gh_issue_gateway.get_review_threads(
                request.pr_number, include_resolved=request.include_resolved
            ),
            discussion_comments=pr_address_context.gh_issue_gateway.get_discussion_comments(
                request.pr_number
            ),
        )
    )
