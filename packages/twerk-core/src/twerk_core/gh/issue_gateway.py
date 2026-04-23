"""Abstract base class for GitHub issue and PR operations.

GitHub models pull requests as issues at the API level (shared numbering, shared
comment endpoints, shared label/assignee machinery), so a single gateway covers
both. Real implementations are free to dispatch individual methods to the gh CLI,
the REST API, or GraphQL — whichever fits the operation best.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from twerk_core.gh.types import (
    Issue,
    IssueComment,
    PRFile,
    PRLookupError,
    PRReview,
    PRReviewComment,
    PRReviewInlineComment,
    PRReviewThread,
    PRSummary,
    Reaction,
    ResolveReviewThreadResult,
    UnresolveReviewThreadResult,
)


class IssueGateway(ABC):
    """Gateway for GitHub issue and PR operations.

    Mutation methods return a result object describing what happened (the new
    entity for create-style mutations; a small status record for state-change
    mutations) and raise on failure.
    """

    # -- Issue queries --

    @abstractmethod
    def list(self, *, label: str | None = None, state: str = "open") -> tuple[Issue, ...]:
        """List issues, optionally filtered by label and state.

        Args:
            label: If provided, only return issues with this label.
            state: One of "open", "closed", or "all". Defaults to "open".
        """

    # -- PR queries --

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
    def get_discussion_comments(self, pr_number: int) -> tuple[IssueComment, ...]:
        """Fetch discussion comments on a PR (not inline review comments)."""

    @abstractmethod
    def get_pr_files(self, pr_number: int) -> tuple[PRFile, ...]:
        """List files changed in a PR, with the unified-diff patch for each.

        Used by callers that need to determine which ``(path, line)`` pairs
        are targetable by inline review comments before submitting a batched
        review — GitHub rejects the whole review with ``422 line not in
        diff`` if any comment points at a line outside a diff hunk.
        """

    @abstractmethod
    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        """Look up the open PR for a branch.

        Returns ``PRSummary`` on success or ``PRLookupError`` when the
        underlying ``gh pr view`` call fails (no PR, auth error, etc.).
        """

    # -- PR mutations --

    @abstractmethod
    def resolve_review_thread(self, thread_id: str) -> ResolveReviewThreadResult:
        """Resolve a review thread.

        Returns a result that records whether the thread was already resolved,
        so sweep-resolve loops can distinguish a no-op from a state change
        without re-querying.
        """

    @abstractmethod
    def unresolve_review_thread(self, thread_id: str) -> UnresolveReviewThreadResult:
        """Unresolve a review thread.

        Returns a result that records whether the thread was already
        unresolved.
        """

    @abstractmethod
    def add_review_thread_reply(self, thread_id: str, body: str) -> PRReviewComment:
        """Add a reply to a review thread. Returns the new reply comment."""

    @abstractmethod
    def add_comment(self, pr_number: int, body: str) -> IssueComment:
        """Add a discussion comment to a PR. Returns the new comment."""

    @abstractmethod
    def find_comment_by_marker(
        self, pr_number: int, marker: str, author_login: str
    ) -> IssueComment | None:
        """Find a discussion comment whose body carries `marker` and whose author matches.

        Requiring both the marker and the author login defends against the
        marker-capture footgun: a human adding the marker to their own comment
        cannot fool the bot into overwriting it on a later run.
        """

    @abstractmethod
    def update_comment(self, comment_id: int, body: str) -> IssueComment:
        """Replace the body of an existing discussion comment. Returns the updated comment."""

    @abstractmethod
    def submit_pr_review(
        self,
        pr_number: int,
        *,
        commit_sha: str,
        body: str,
        comments: Sequence[PRReviewInlineComment],
    ) -> int:
        """Submit a batched PR review with optional inline comments.

        Posts via ``POST /repos/{owner}/{repo}/pulls/{n}/reviews`` with
        ``event="COMMENT"`` so the review is post-only and does not block
        the PR's merge check. Returns the new review's numeric ``id``.

        All ``comments`` target ``side="RIGHT"`` (the PR head's view of the
        file). Callers must filter out findings whose ``(path, line)`` is
        not inside a diff hunk on ``commit_sha`` — an out-of-diff line
        fails the whole review with a non-transient ``422``.
        """

    @abstractmethod
    def add_reaction(self, comment_id: int, reaction: str) -> Reaction:
        """Add a reaction to a comment. Returns the new reaction."""
