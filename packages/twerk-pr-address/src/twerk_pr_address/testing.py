"""Test utilities for the pr-address gateway."""

from __future__ import annotations

from twerk_pr_address.gateway.abc import PRAddressGitHub
from twerk_pr_address.types import (
    IssueComment,
    PRReview,
    PRReviewThread,
    RestructuredFile,
)


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
        restructured_files: tuple[RestructuredFile, ...] = (),
    ) -> None:
        self._pr_review_threads = pr_review_threads or {}
        self._pr_reviews = pr_reviews or {}
        self._pr_discussion_comments = pr_discussion_comments or {}
        self._restructured_files = restructured_files

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

    def get_restructured_files(self, base_ref: str) -> tuple[RestructuredFile, ...]:
        return self._restructured_files
