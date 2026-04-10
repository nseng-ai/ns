"""Abstract base class for the PR address GitHub gateway."""

from __future__ import annotations

from abc import ABC, abstractmethod

from twerk_pr_address.types import (
    IssueComment,
    PRReview,
    PRReviewThread,
    RestructuredFile,
)


class PRAddressGitHub(ABC):
    """Gateway interface for the pr-address feature.

    Distinct from twerk_core.gh.PRGateway: it uses pr_-prefixed method
    names and adds a git operation (get_restructured_files) so the feature
    can stay self-contained.
    """

    @abstractmethod
    def get_pr_review_threads(
        self, pr_number: int, *, include_resolved: bool = False
    ) -> tuple[PRReviewThread, ...]:
        """Fetch review threads for a PR.

        Args:
            pr_number: The PR number.
            include_resolved: If True, include resolved threads. Defaults to
                only returning unresolved threads.
        """

    @abstractmethod
    def get_pr_reviews(self, pr_number: int) -> tuple[PRReview, ...]:
        """Fetch PR-level review submissions (approve, request changes, comment)."""

    @abstractmethod
    def get_pr_discussion_comments(self, pr_number: int) -> tuple[IssueComment, ...]:
        """Fetch discussion comments on a PR (not inline review comments)."""

    @abstractmethod
    def get_restructured_files(self, base_ref: str) -> tuple[RestructuredFile, ...]:
        """Return files renamed or copied between base_ref and HEAD."""
