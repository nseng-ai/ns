"""Unified PR gateway surface for GitHub pull-request workflows."""

from __future__ import annotations

from abc import ABC, abstractmethod

from asdl_core.gh.real_gateway_helpers import (
    add_pr_discussion_comment,
    add_pr_discussion_comment_reaction,
    add_review_thread_reply,
    create_pr_review,
    fetch_pr_summary_for_branch,
    find_pr_discussion_comment_by_marker,
    get_pr_changed_files,
    get_pr_discussion_comments,
    get_pr_review_comments,
    get_review_threads,
    get_reviews,
    merge_pr,
    resolve_review_thread,
    search_prs,
    unresolve_review_thread,
    update_pr_discussion_comment,
)
from asdl_core.gh.types import (
    PRChangedFile,
    PRDiscussionComment,
    PRGatewayFailure,
    PRInlineCommentInput,
    PRLookupMiss,
    PRMergeOutcome,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRReviewThreadState,
    PRStateFilter,
    PRSummary,
    Reaction,
)


class PRGateway(ABC):
    """Unified core boundary for PR lookup, review, conversation, and merge operations."""

    # -- PR queries --

    @abstractmethod
    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupMiss | PRGatewayFailure:
        """Look up the PR for a branch."""

    @abstractmethod
    def search_prs(
        self, query: str, *, state: PRStateFilter
    ) -> tuple[PRSummary, ...] | PRGatewayFailure:
        """Search PRs in the given lifecycle ``state`` by free-text query."""

    @abstractmethod
    def get_review_threads(
        self, pr_number: int, *, include_resolved: bool = False
    ) -> tuple[PRReviewThread, ...]:
        """Fetch review threads for a PR."""

    @abstractmethod
    def get_reviews(self, pr_number: int) -> tuple[PRReview, ...]:
        """Fetch PR-level review submissions."""

    @abstractmethod
    def get_pr_changed_files(self, pr_number: int) -> tuple[PRChangedFile, ...]:
        """Fetch file-level diff metadata for a PR."""

    @abstractmethod
    def get_pr_review_comments(self, pr_number: int) -> tuple[PRReviewComment, ...]:
        """Fetch inline review comments on a PR."""

    @abstractmethod
    def get_pr_discussion_comments(self, pr_number: int) -> tuple[PRDiscussionComment, ...]:
        """Fetch top-level discussion comments on a PR."""

    # -- PR mutations --

    @abstractmethod
    def merge_pr(
        self,
        pr_number: int,
        *,
        match_head_commit: str,
        admin: bool,
        auto: bool,
    ) -> PRMergeOutcome | PRGatewayFailure:
        """Squash-merge or enable auto-merge for ``pr_number`` with a head guard."""

    @abstractmethod
    def resolve_review_thread(self, thread_id: str) -> PRReviewThreadState:
        """Resolve a review thread and return its post-mutation state."""

    @abstractmethod
    def unresolve_review_thread(self, thread_id: str) -> PRReviewThreadState:
        """Unresolve a review thread and return its post-mutation state."""

    @abstractmethod
    def add_review_thread_reply(self, thread_id: str, body: str) -> PRReviewComment:
        """Add a reply to a review thread. Returns the new reply comment."""

    @abstractmethod
    def create_pr_review(
        self, pr_number: int, comments: tuple[PRInlineCommentInput, ...]
    ) -> PRReview:
        """Submit one PR review containing multiple inline comments."""

    @abstractmethod
    def add_pr_discussion_comment(self, pr_number: int, body: str) -> PRDiscussionComment:
        """Add a top-level discussion comment to a PR."""

    @abstractmethod
    def find_pr_discussion_comment_by_marker(
        self, pr_number: int, marker: str, author_login: str
    ) -> PRDiscussionComment | None:
        """Find a PR discussion comment carrying ``marker`` from ``author_login``."""

    @abstractmethod
    def update_pr_discussion_comment(self, comment_id: int, body: str) -> PRDiscussionComment:
        """Replace the body of an existing PR discussion comment."""

    @abstractmethod
    def add_pr_discussion_comment_reaction(self, comment_id: int, reaction: str) -> Reaction:
        """Add a reaction to a PR discussion comment."""


class RealPRGateway(PRGateway):
    """Real implementation backed by the ``gh`` CLI."""

    def __init__(self, *, repo: str | None = None) -> None:
        self._repo = repo

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupMiss | PRGatewayFailure:
        return fetch_pr_summary_for_branch(branch, repo=self._repo)

    def search_prs(
        self, query: str, *, state: PRStateFilter
    ) -> tuple[PRSummary, ...] | PRGatewayFailure:
        return search_prs(query, state=state, repo=self._repo)

    def get_review_threads(
        self, pr_number: int, *, include_resolved: bool = False
    ) -> tuple[PRReviewThread, ...]:
        return get_review_threads(pr_number, include_resolved=include_resolved, repo=self._repo)

    def get_reviews(self, pr_number: int) -> tuple[PRReview, ...]:
        return get_reviews(pr_number, repo=self._repo)

    def get_pr_changed_files(self, pr_number: int) -> tuple[PRChangedFile, ...]:
        return get_pr_changed_files(pr_number, repo=self._repo)

    def get_pr_review_comments(self, pr_number: int) -> tuple[PRReviewComment, ...]:
        return get_pr_review_comments(pr_number, repo=self._repo)

    def get_pr_discussion_comments(self, pr_number: int) -> tuple[PRDiscussionComment, ...]:
        return get_pr_discussion_comments(pr_number, repo=self._repo)

    def merge_pr(
        self,
        pr_number: int,
        *,
        match_head_commit: str,
        admin: bool,
        auto: bool,
    ) -> PRMergeOutcome | PRGatewayFailure:
        return merge_pr(
            pr_number,
            match_head_commit=match_head_commit,
            admin=admin,
            auto=auto,
            repo=self._repo,
        )

    def resolve_review_thread(self, thread_id: str) -> PRReviewThreadState:
        return resolve_review_thread(thread_id)

    def unresolve_review_thread(self, thread_id: str) -> PRReviewThreadState:
        return unresolve_review_thread(thread_id)

    def add_review_thread_reply(self, thread_id: str, body: str) -> PRReviewComment:
        return add_review_thread_reply(thread_id, body)

    def create_pr_review(
        self, pr_number: int, comments: tuple[PRInlineCommentInput, ...]
    ) -> PRReview:
        return create_pr_review(pr_number, comments, repo=self._repo)

    def add_pr_discussion_comment(self, pr_number: int, body: str) -> PRDiscussionComment:
        return add_pr_discussion_comment(pr_number, body, repo=self._repo)

    def find_pr_discussion_comment_by_marker(
        self, pr_number: int, marker: str, author_login: str
    ) -> PRDiscussionComment | None:
        return find_pr_discussion_comment_by_marker(
            pr_number,
            marker,
            author_login,
            repo=self._repo,
        )

    def update_pr_discussion_comment(self, comment_id: int, body: str) -> PRDiscussionComment:
        return update_pr_discussion_comment(comment_id, body, repo=self._repo)

    def add_pr_discussion_comment_reaction(self, comment_id: int, reaction: str) -> Reaction:
        return add_pr_discussion_comment_reaction(comment_id, reaction, repo=self._repo)
