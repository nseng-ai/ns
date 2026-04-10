"""Abstract base class for GitHub PR operations."""

from abc import ABC, abstractmethod

from twerk_core.gh.types import (
    GhIssueComment,
    PRReview,
    PRReviewThread,
)


class PRGateway(ABC):
    """Gateway for GitHub PR operations.

    Sub-gateway of the GH facade. Contains PR-flavored operations including
    discussion comments and reactions (which touch issue-like resources under
    the hood) because the user-facing mental model groups them with PR
    workflows. The underlying implementations can share code with the
    GhIssueGateway.

    Mutation methods raise on failure rather than returning a success bool —
    callers shouldn't have to remember to check.
    """

    # -- Queries --

    @abstractmethod
    def get_review_threads(
        self, pr_number: int, *, include_resolved: bool = False
    ) -> tuple[PRReviewThread, ...]:
        """Fetch review threads for a PR.

        Args:
            pr_number: The PR number.
            include_resolved: If True, include resolved threads. Defaults to
                only returning unresolved threads.
        """

    @abstractmethod
    def get_reviews(self, pr_number: int) -> tuple[PRReview, ...]:
        """Fetch PR-level review submissions (approve, request changes, comment)."""

    @abstractmethod
    def get_discussion_comments(self, pr_number: int) -> tuple[GhIssueComment, ...]:
        """Fetch discussion comments on a PR (not inline review comments)."""

    @abstractmethod
    def get_number_for_branch(self, branch: str) -> int | None:
        """Look up the open PR number for a branch. Returns None if no PR exists."""

    # -- Mutations --

    @abstractmethod
    def resolve_review_thread(self, thread_id: str) -> None:
        """Resolve a review thread. Raises on failure."""

    @abstractmethod
    def unresolve_review_thread(self, thread_id: str) -> None:
        """Unresolve a review thread. Raises on failure."""

    @abstractmethod
    def add_review_thread_reply(self, thread_id: str, body: str) -> None:
        """Add a reply to a review thread. Raises on failure."""

    @abstractmethod
    def add_comment(self, pr_number: int, body: str) -> int:
        """Add a discussion comment to a PR. Returns the comment ID."""

    @abstractmethod
    def add_reaction(self, comment_id: int, reaction: str) -> None:
        """Add a reaction to a comment. Raises on failure."""
