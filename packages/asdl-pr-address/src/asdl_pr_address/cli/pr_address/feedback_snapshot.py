"""Fetch and normalize PR feedback snapshots for pr-address operations."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import PRDiscussionComment, PRReview, PRReviewThread
from asdl_pr_address.cli.pr_address.review_filtering import filter_empty_reviews


@dataclass(frozen=True)
class FeedbackSnapshot:
    pr_number: int
    reviews: tuple[PRReview, ...]
    review_threads: tuple[PRReviewThread, ...]
    counted_review_threads: tuple[PRReviewThread, ...]
    discussion_comments: tuple[PRDiscussionComment, ...]


def fetch_feedback_snapshot(
    pr_gateway: PRGateway,
    *,
    pr_number: int,
    include_resolved: bool,
    include_empty_reviews: bool,
    count_all_review_threads: bool = False,
) -> FeedbackSnapshot:
    raw_reviews = pr_gateway.get_reviews(pr_number)
    reviews = _reviews_for_request(
        raw_reviews,
        include_empty_reviews=include_empty_reviews,
    )

    if count_all_review_threads:
        counted_review_threads = pr_gateway.get_review_threads(pr_number, include_resolved=True)
        review_threads = _visible_threads(
            counted_review_threads,
            include_resolved=include_resolved,
        )
    else:
        review_threads = pr_gateway.get_review_threads(
            pr_number,
            include_resolved=include_resolved,
        )
        counted_review_threads = review_threads

    return FeedbackSnapshot(
        pr_number=pr_number,
        reviews=reviews,
        review_threads=review_threads,
        counted_review_threads=counted_review_threads,
        discussion_comments=pr_gateway.get_pr_discussion_comments(pr_number),
    )


def _reviews_for_request(
    raw_reviews: tuple[PRReview, ...],
    *,
    include_empty_reviews: bool,
) -> tuple[PRReview, ...]:
    if include_empty_reviews:
        return raw_reviews
    return filter_empty_reviews(raw_reviews)


def _visible_threads(
    threads: tuple[PRReviewThread, ...],
    *,
    include_resolved: bool,
) -> tuple[PRReviewThread, ...]:
    if include_resolved:
        return threads
    return tuple(thread for thread in threads if not thread.is_resolved)
