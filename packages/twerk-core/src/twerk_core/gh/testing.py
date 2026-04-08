"""Test utilities for the GitHub gateway facade."""

from __future__ import annotations

from twerk_core.gh.facade import GH
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.types import (
    IssueComment,
    PRReview,
    PRReviewThread,
)


class FakePRGateway(PRGateway):
    """In-memory fake implementation of PRGateway.

    Constructor-only configuration with mutation tracking for assertions.
    No public setup methods — all state is provided at construction.
    """

    def __init__(
        self,
        *,
        review_threads: dict[int, list[PRReviewThread]] | None = None,
        reviews: dict[int, list[PRReview]] | None = None,
        discussion_comments: dict[int, list[IssueComment]] | None = None,
        numbers_by_branch: dict[str, int] | None = None,
        resolve_thread_failures: set[str] | None = None,
        unresolve_thread_failures: set[str] | None = None,
        next_comment_id: int = 1000,
    ) -> None:
        self._review_threads = review_threads or {}
        self._reviews = reviews or {}
        self._discussion_comments = discussion_comments or {}
        self._numbers_by_branch = numbers_by_branch or {}
        self._resolve_thread_failures = resolve_thread_failures or set()
        self._unresolve_thread_failures = unresolve_thread_failures or set()
        self._next_comment_id = next_comment_id

        # Mutation tracking
        self._resolved_thread_ids: list[str] = []
        self._unresolved_thread_ids: list[str] = []
        self._thread_replies: list[tuple[str, str]] = []
        self._comments: list[tuple[int, str]] = []
        self._reactions: list[tuple[int, str]] = []

    # -- Queries --

    def get_review_threads(
        self, pr_number: int, *, include_resolved: bool = False
    ) -> tuple[PRReviewThread, ...]:
        threads = self._review_threads.get(pr_number, [])
        if not include_resolved:
            threads = [t for t in threads if not t.is_resolved]
        return tuple(threads)

    def get_reviews(self, pr_number: int) -> tuple[PRReview, ...]:
        return tuple(self._reviews.get(pr_number, []))

    def get_discussion_comments(self, pr_number: int) -> tuple[IssueComment, ...]:
        return tuple(self._discussion_comments.get(pr_number, []))

    def get_number_for_branch(self, branch: str) -> int | None:
        return self._numbers_by_branch.get(branch)

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

    def add_comment(self, pr_number: int, body: str) -> int:
        comment_id = self._next_comment_id
        self._next_comment_id += 1
        self._comments.append((pr_number, body))
        return comment_id

    def add_reaction(self, comment_id: int, reaction: str) -> bool:
        self._reactions.append((comment_id, reaction))
        return True


def make_fake_gh(
    *,
    pr: FakePRGateway | None = None,
) -> GH:
    """Convenience factory for building a GH facade with fake sub-gateways."""
    return GH(pr=pr or FakePRGateway())
