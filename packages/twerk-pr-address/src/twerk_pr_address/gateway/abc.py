"""Abstract base class for GitHub operations needed by PR address commands."""

from __future__ import annotations

from abc import ABC, abstractmethod

from twerk_pr_address.types import (
    IssueComment,
    PRReview,
    PRReviewThread,
    RestructuredFile,
)


class PRAddressGitHub(ABC):
    """Narrow gateway for GitHub operations used by PR address commands.

    Unlike erk's monolithic LocalGitHub (50+ methods), this ABC contains only
    the methods needed for pr-address operations. The gateway is constructed
    with repository context (owner/repo/root) so methods don't need repo_root.
    """

    # -- Queries --

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
    def get_pr_number_for_branch(self, branch: str) -> int | None:
        """Look up the open PR number for a branch. Returns None if no PR exists."""

    @abstractmethod
    def get_restructured_files(self, base_ref: str) -> tuple[RestructuredFile, ...]:
        """Detect files renamed/copied/moved relative to a base ref using git diff -M -C."""

    # -- Mutations --

    @abstractmethod
    def resolve_review_thread(self, thread_id: str) -> bool:
        """Resolve a review thread. Returns True on success."""

    @abstractmethod
    def unresolve_review_thread(self, thread_id: str) -> bool:
        """Unresolve a review thread. Returns True on success."""

    @abstractmethod
    def add_review_thread_reply(self, thread_id: str, body: str) -> bool:
        """Add a reply to a review thread. Returns True on success."""

    @abstractmethod
    def add_pr_comment(self, pr_number: int, body: str) -> int:
        """Add a discussion comment to a PR. Returns the comment ID."""

    @abstractmethod
    def add_reaction(self, comment_id: int, reaction: str) -> bool:
        """Add a reaction to a comment. Returns True on success."""
