"""Fetch all PR feedback (reviews, threads, discussion comments) in a single batch."""

import dataclasses
from dataclasses import dataclass
from typing import Any

from clinkr.command import ClinkrCommandError
from clinkr.operation import clinkr_operation
from twerk_core.gh.types import IssueComment, PRReview, PRReviewThread
from twerk_pr_address.cli.pr_address._gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class GetFeedbackRequest:
    pr_number: int
    include_resolved: bool = False


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
    request: GetFeedbackRequest,
) -> GetFeedbackResult | ClinkrCommandError:
    gateway = get_gh_issue_gateway()
    return GetFeedbackResult(
        pr_number=request.pr_number,
        reviews=gateway.get_reviews(request.pr_number),
        review_threads=gateway.get_review_threads(
            request.pr_number, include_resolved=request.include_resolved
        ),
        discussion_comments=gateway.get_discussion_comments(request.pr_number),
    )
