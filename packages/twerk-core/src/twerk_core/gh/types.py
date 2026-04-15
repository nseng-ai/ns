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


@dataclass(frozen=True)
class Issue:
    """A GitHub issue summary as returned by `gh issue list`.

    Pure data type with no serialization helpers — callers compose JSON output
    in their own result types so this stays consistent with the other types in
    this module (PRReview, PRReviewThread, IssueComment, ...).
    """

    number: int
    title: str
    state: str
    updated_at: str
    url: str


@dataclass(frozen=True)
class Reaction:
    """A reaction on a GitHub issue/PR comment.

    `content` is one of GitHub's reaction tokens: "+1", "-1", "laugh",
    "confused", "heart", "hooray", "rocket", "eyes".
    """

    id: int
    comment_id: int
    content: str


@dataclass(frozen=True)
class PRSummary:
    """Summary metadata for an open PR associated with a branch.

    Returned by `get_pr_for_branch` — carries the fields the pr-address skill
    needs for its Phase 0 preflight (number, title, URL, head/base refs).
    """

    number: int
    title: str
    url: str
    head_ref_name: str
    base_ref_name: str


@dataclass(frozen=True)
class PRLookupError:
    """Error from looking up a PR for a branch.

    Returned when `gh pr view` fails — carries stderr and returncode so
    callers can distinguish "no PR found" from "gh CLI broken".
    """

    stderr: str
    returncode: int


@dataclass(frozen=True)
class ResolveReviewThreadResult:
    """Result of resolving a review thread.

    `was_already_resolved` lets callers in sweep-resolve loops distinguish a
    no-op from a state change without re-querying.

    **Fake vs real semantics:** the fake (`FakeIssueGateway`) preserves
    instance-level call tracking and reports `True` on repeated calls for the
    same `thread_id`. The real gateway always reports `False`, because
    GitHub's `resolveReviewThread` mutation is idempotent and exposes no
    pre-state signal — the docstring promise of "without re-querying" rules
    out a pre-mutation lookup. Callers that genuinely need before/after state
    should diff `get_review_threads` around the sweep.
    """

    thread_id: str
    was_already_resolved: bool


@dataclass(frozen=True)
class UnresolveReviewThreadResult:
    """Result of unresolving a review thread.

    See `ResolveReviewThreadResult` for the fake-vs-real semantic split:
    the fake tracks per-instance call history; the real gateway always
    reports `was_already_unresolved=False` because GitHub's mutation is
    idempotent with no pre-state signal.
    """

    thread_id: str
    was_already_unresolved: bool
