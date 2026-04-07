"""Domain types for PR review address operations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

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
class IssueComment:
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
