"""Test utilities for the pr-address gateway."""

from twerk_core.gh.types import IssueComment, PRReview, PRReviewThread
from twerk_pr_address.gateway.abc import PRAddressGitHub


class FakePRAddressGitHub(PRAddressGitHub):
    """In-memory fake for the PR address gateway.

    Constructor-only configuration; no public setup after init.
    """

    def __init__(
        self,
        *,
        pr_review_threads: dict[int, list[PRReviewThread]] | None = None,
        pr_reviews: dict[int, list[PRReview]] | None = None,
        pr_discussion_comments: dict[int, list[IssueComment]] | None = None,
    ) -> None:
        self._pr_review_threads = pr_review_threads or {}
        self._pr_reviews = pr_reviews or {}
        self._pr_discussion_comments = pr_discussion_comments or {}

    def get_pr_review_threads(
        self, pr_number: int, *, include_resolved: bool = False
    ) -> tuple[PRReviewThread, ...]:
        threads = self._pr_review_threads.get(pr_number, [])
        if not include_resolved:
            threads = [t for t in threads if not t.is_resolved]
        return tuple(threads)

    def get_pr_reviews(self, pr_number: int) -> tuple[PRReview, ...]:
        return tuple(self._pr_reviews.get(pr_number, []))

    def get_pr_discussion_comments(self, pr_number: int) -> tuple[IssueComment, ...]:
        return tuple(self._pr_discussion_comments.get(pr_number, []))
