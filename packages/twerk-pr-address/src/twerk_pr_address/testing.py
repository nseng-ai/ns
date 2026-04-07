"""Test utilities for twerk-pr-address.

Provides FakePRAddressGitHub for use in tests, both within this package
and by downstream consumers.
"""

from __future__ import annotations

from twerk_pr_address.gateway.abc import PRAddressGitHub
from twerk_pr_address.types import (
    IssueComment,
    PRReview,
    PRReviewThread,
    RestructuredFile,
)


class FakePRAddressGitHub(PRAddressGitHub):
    """In-memory fake implementation of PRAddressGitHub.

    Constructor-only configuration with mutation tracking for assertions.
    No public setup methods — all state is provided at construction.
    """

    def __init__(
        self,
        *,
        pr_review_threads: dict[int, list[PRReviewThread]] | None = None,
        pr_reviews: dict[int, list[PRReview]] | None = None,
        pr_discussion_comments: dict[int, list[IssueComment]] | None = None,
        pr_numbers_by_branch: dict[str, int] | None = None,
        restructured_files: tuple[RestructuredFile, ...] = (),
        resolve_thread_failures: set[str] | None = None,
        unresolve_thread_failures: set[str] | None = None,
        next_comment_id: int = 1000,
    ) -> None:
        self._pr_review_threads = pr_review_threads or {}
        self._pr_reviews = pr_reviews or {}
        self._pr_discussion_comments = pr_discussion_comments or {}
        self._pr_numbers_by_branch = pr_numbers_by_branch or {}
        self._restructured_files = restructured_files
        self._resolve_thread_failures = resolve_thread_failures or set()
        self._unresolve_thread_failures = unresolve_thread_failures or set()
        self._next_comment_id = next_comment_id

        # Mutation tracking
        self._resolved_thread_ids: list[str] = []
        self._unresolved_thread_ids: list[str] = []
        self._thread_replies: list[tuple[str, str]] = []
        self._pr_comments: list[tuple[int, str]] = []
        self._reactions: list[tuple[int, str]] = []

    # -- Queries --

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

    def get_pr_number_for_branch(self, branch: str) -> int | None:
        return self._pr_numbers_by_branch.get(branch)

    def get_restructured_files(self, base_ref: str) -> tuple[RestructuredFile, ...]:
        return self._restructured_files

    # -- Mutations --

    def resolve_review_thread(self, thread_id: str) -> bool:
        if thread_id in self._resolve_thread_failures:
            return False
        self._resolved_thread_ids.append(thread_id)
        return True

    def unresolve_review_thread(self, thread_id: str) -> bool:
        if thread_id in self._unresolve_thread_failures:
            return False
        self._unresolved_thread_ids.append(thread_id)
        return True

    def add_review_thread_reply(self, thread_id: str, body: str) -> bool:
        self._thread_replies.append((thread_id, body))
        return True

    def add_pr_comment(self, pr_number: int, body: str) -> int:
        comment_id = self._next_comment_id
        self._next_comment_id += 1
        self._pr_comments.append((pr_number, body))
        return comment_id

    def add_reaction(self, comment_id: int, reaction: str) -> bool:
        self._reactions.append((comment_id, reaction))
        return True
