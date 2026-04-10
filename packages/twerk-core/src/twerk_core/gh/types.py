"""Domain types for GitHub gateway operations."""

from dataclasses import dataclass
from typing import Literal

# All review states GitHub may return. Queries that filter to actionable states
# (e.g. the GraphQL `[CHANGES_REQUESTED, APPROVED, COMMENTED]` filter) won't
# surface PENDING/DISMISSED in practice, but downstream code must still handle
# the full type.
PRReviewState = Literal["PENDING", "COMMENTED", "APPROVED", "CHANGES_REQUESTED", "DISMISSED"]


@dataclass(frozen=True)
class PRReviewComment:
    """A single comment within a PR review thread."""

    id: int
    body: str
    author: str
    path: str
    line: int | None
    created_at: str


@dataclass(frozen=True)
class PRReviewThread:
    """A review thread on a PR.

    Attributes:
        id: GraphQL node ID (needed for resolution mutations)
        path: File path the thread is on
        line: Line number (None for file-level or outdated comments)
        is_resolved: Whether the thread has been resolved
        is_outdated: Whether the thread is outdated (code changed since comment)
        comments: Comments in this thread, ordered chronologically
    """

    id: str
    path: str
    line: int | None
    is_resolved: bool
    is_outdated: bool
    comments: tuple[PRReviewComment, ...]


@dataclass(frozen=True)
class PRReview:
    """A PR-level review submission (not an inline thread comment).

    Represents a review submitted via GitHub's "Review changes" flow.
    """

    id: str
    author: str
    body: str
    state: PRReviewState
    submitted_at: str


@dataclass(frozen=True)
class GhIssueComment:
    """A comment on a GitHub issue or PR discussion thread."""

    id: int
    body: str
    author: str
    url: str


@dataclass(frozen=True)
class RestructuredFile:
    """A file that was renamed, copied, or moved (detected by git diff -M -C)."""

    status: str  # "R" for rename, "C" for copy
    old_path: str
    new_path: str
    similarity: int  # percentage similarity (0-100)


@dataclass(frozen=True)
class GhIssue:
    """A GitHub issue summary as returned by `gh issue list`.

    Pure data type with no serialization helpers — callers compose JSON output
    in their own result types so this stays consistent with the other types in
    this module (PRReview, PRReviewThread, GhIssueComment, ...).
    """

    number: int
    title: str
    state: str
    updated_at: str


@dataclass(frozen=True)
class GhReaction:
    """A reaction on a GitHub issue/PR comment.

    `content` is one of GitHub's reaction tokens: "+1", "-1", "laugh",
    "confused", "heart", "hooray", "rocket", "eyes".
    """

    id: int
    comment_id: int
    content: str


@dataclass(frozen=True)
class ResolveReviewThreadResult:
    """Result of resolving a review thread.

    `was_already_resolved` lets callers in sweep-resolve loops distinguish a
    no-op from a state change without re-querying.
    """

    thread_id: str
    was_already_resolved: bool


@dataclass(frozen=True)
class UnresolveReviewThreadResult:
    """Result of unresolving a review thread."""

    thread_id: str
    was_already_unresolved: bool
