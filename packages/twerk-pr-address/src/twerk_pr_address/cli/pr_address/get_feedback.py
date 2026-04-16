"""Fetch all PR feedback (reviews, threads, discussion comments) in a single batch."""

import dataclasses
from dataclasses import dataclass
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import IssueComment, PRReview, PRReviewThread
from twerk_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway
from twerk_pr_address.cli.pr_address.review_filtering import filter_empty_reviews


@dataclass(frozen=True)
class GetFeedbackRequest:
    pr_number: int
    include_resolved: bool = False
    include_empty_reviews: bool = False


@dataclass(frozen=True)
class GetFeedbackResult:
    pr_number: int
    reviews: tuple[PRReview, ...]
    review_threads: tuple[PRReviewThread, ...]
    discussion_comments: tuple[IssueComment, ...]

    def to_json_dict(self) -> dict[str, Any]:
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
) -> GetFeedbackResult | ClinkrCommandError:
    gateway = get_gh_issue_gateway(ctx)
    raw_reviews = gateway.get_reviews(request.pr_number)
    reviews = raw_reviews if request.include_empty_reviews else filter_empty_reviews(raw_reviews)
    return GetFeedbackResult(
        pr_number=request.pr_number,
        reviews=reviews,
        review_threads=gateway.get_review_threads(
            request.pr_number, include_resolved=request.include_resolved
        ),
        discussion_comments=gateway.get_discussion_comments(request.pr_number),
    )
