"""Abstract base class for the PR address GitHub gateway."""

from abc import ABC, abstractmethod

from twerk_core.gh.types import GhIssueComment, PRReview, PRReviewThread


class PRAddressGitHub(ABC):
    """Gateway interface for the pr-address feature.

    GitHub PR queries: reviews, review threads, and discussion comments.
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
    def get_pr_discussion_comments(self, pr_number: int) -> tuple[GhIssueComment, ...]:
        """Fetch discussion comments on a PR (not inline review comments)."""
