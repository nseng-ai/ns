"""Test utilities for the GitHub gateway."""

from __future__ import annotations

from collections.abc import Sequence

from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.gh.types import (
    Issue,
    IssueComment,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    Reaction,
    ResolveReviewThreadResult,
    UnresolveReviewThreadResult,
)


class FakeIssueGateway(IssueGateway):
    """In-memory fake implementation of IssueGateway.

    Constructor-only configuration with mutation tracking for assertions.
    No public setup methods — all state is provided at construction.

    The fake accepts a `label` argument on `list()` for interface compatibility
    but does not actually filter on it — tests seed the fake with the issues
    they expect back.
    """

    def __init__(
        self,
        *,
        issues: Sequence[Issue] = (),
        review_threads: dict[int, list[PRReviewThread]] | None = None,
        reviews: dict[int, list[PRReview]] | None = None,
        discussion_comments: dict[int, list[IssueComment]] | None = None,
        numbers_by_branch: dict[str, int] | None = None,
    ) -> None:
        self._issues = tuple(issues)
        self._review_threads = review_threads or {}
        self._reviews = reviews or {}
        self._discussion_comments = discussion_comments or {}
        self._numbers_by_branch = numbers_by_branch or {}
        self._next_comment_id = 1
        self._next_reaction_id = 1

        # Mutation tracking — public-but-underscored, read in tests for assertions.
        self._resolved_thread_ids: list[str] = []
        self._unresolved_thread_ids: list[str] = []
        self._thread_replies: list[tuple[str, str]] = []
        self._comments: list[tuple[int, str]] = []
        self._reactions: list[tuple[int, str]] = []

    # -- Issue queries --

    def list(self, *, label: str | None = None, state: str = "open") -> tuple[Issue, ...]:
        if state == "all":
            return self._issues
        return tuple(i for i in self._issues if i.state.lower() == state.lower())

    # -- PR queries --

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

    # -- PR mutations --

    def resolve_review_thread(self, thread_id: str) -> ResolveReviewThreadResult:
        was_already_resolved = thread_id in self._resolved_thread_ids
        self._resolved_thread_ids.append(thread_id)
        return ResolveReviewThreadResult(
            thread_id=thread_id,
            was_already_resolved=was_already_resolved,
        )

    def unresolve_review_thread(self, thread_id: str) -> UnresolveReviewThreadResult:
        was_already_unresolved = thread_id in self._unresolved_thread_ids
        self._unresolved_thread_ids.append(thread_id)
        return UnresolveReviewThreadResult(
            thread_id=thread_id,
            was_already_unresolved=was_already_unresolved,
        )

    def add_review_thread_reply(self, thread_id: str, body: str) -> PRReviewComment:
        comment_id = self._next_comment_id
        self._next_comment_id += 1
        self._thread_replies.append((thread_id, body))
        return PRReviewComment(
            id=comment_id,
            body=body,
            author="fake-user",
            path="",
            line=None,
            created_at="",
        )

    def add_comment(self, pr_number: int, body: str) -> IssueComment:
        comment_id = self._next_comment_id
        self._next_comment_id += 1
        self._comments.append((pr_number, body))
        return IssueComment(
            id=comment_id,
            body=body,
            author="fake-user",
            url=f"https://github.com/fake/fake/pull/{pr_number}#issuecomment-{comment_id}",
        )

    def add_reaction(self, comment_id: int, reaction: str) -> Reaction:
        reaction_id = self._next_reaction_id
        self._next_reaction_id += 1
        self._reactions.append((comment_id, reaction))
        return Reaction(id=reaction_id, comment_id=comment_id, content=reaction)
