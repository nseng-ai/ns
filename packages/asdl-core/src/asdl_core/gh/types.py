"""Domain types for GitHub gateway operations."""

from dataclasses import dataclass
from typing import Literal

# All review states GitHub may return. Queries that filter to actionable states
# (e.g. the GraphQL `[CHANGES_REQUESTED, APPROVED, COMMENTED]` filter) won't
# surface PENDING/DISMISSED in practice, but downstream code must still handle
# the full type.
PRReviewState = Literal["PENDING", "COMMENTED", "APPROVED", "CHANGES_REQUESTED", "DISMISSED"]

# Lifecycle state a PR is currently in. `gh pr view --json state` returns
# exactly one of these tokens.
PRState = Literal["OPEN", "CLOSED", "MERGED"]

# Filter value accepted by `gh pr list --state`. Lowercase, plus `all` which
# isn't a real PR state but disables the filter.
PRStateFilter = Literal["open", "closed", "merged", "all"]


@dataclass(frozen=True)
class PRChangedFile:
    """A file changed in a PR, as returned by the GitHub pulls files endpoint.

    Attributes:
        path: Repository-relative file path (`filename` in the REST payload).
        status: GitHub file status such as `added`, `modified`, `removed`, or `renamed`.
        patch: Unified diff patch for text files. GitHub omits this for binary
            files and files whose patch is too large.
    """

    path: str
    status: str
    patch: str | None


@dataclass(frozen=True)
class PRReviewComment:
    """A single comment within a PR review thread.

    Attributes:
        id: Numeric database ID of the comment.
        body: Markdown body of the comment.
        author: Author's GitHub login, or empty string if the account was
            deleted.
        path: File path the comment is on.
        line: Line number (None for file-level or outdated comments). When
            the parent thread covers a multi-line range, this is the *end*
            of that range; `start_line` is the start. Equals `start_line`
            for single-line threads (in which case `start_line` is None).
        start_line: Start of the multi-line range the comment covers, or
            None for single-line comments. GitHub renders multi-line
            threads as "lines +<start_line> to +<line>".
        created_at: ISO-8601 timestamp of the comment's creation.
    """

    id: int
    body: str
    author: str
    path: str
    line: int | None
    created_at: str
    start_line: int | None = None


@dataclass(frozen=True)
class PRReviewThread:
    """A review thread on a PR.

    Attributes:
        id: GraphQL node ID (needed for resolution mutations)
        path: File path the thread is on
        line: Line number (None for file-level or outdated comments). When
            the thread covers a multi-line range, this is the *end* of that
            range; `start_line` is the start. Equals the thread's sole line
            for single-line threads (in which case `start_line` is None).
        start_line: Start of the multi-line range this thread covers, or
            None for single-line threads. GitHub renders multi-line threads
            as "lines +<start_line> to +<line>".
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
    start_line: int | None = None


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
class PRInlineCommentInput:
    """One inline comment to submit as part of a PR review."""

    path: str
    line: int
    body: str


@dataclass(frozen=True)
class PRReviewSubmission:
    """Result of creating a PR review."""

    id: str
    state: PRReviewState
    body: str
    submitted_at: str


@dataclass(frozen=True)
class PRDiscussionComment:
    """A top-level PR discussion comment.

    GitHub stores these through issue-comment API endpoints, but this type is
    named for the PR-domain concept exposed by the core gateway.
    """

    id: int
    body: str
    author: str
    url: str


@dataclass(frozen=True)
class IssueComment:
    """A comment on a GitHub issue or PR discussion thread."""

    id: int
    body: str
    author: str
    url: str


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
    """Summary metadata for a PR associated with a branch.

    Returned by `get_pr_for_branch` — carries the fields the pr-address skill
    needs for its Phase 0 preflight (number, title, body, URL, head/base refs)
    plus the lifecycle `state` used by `slot gc` to decide whether to reclaim
    the slot.
    """

    number: int
    title: str
    url: str
    head_ref_name: str
    base_ref_name: str
    state: PRState
    body: str | None = None
    head_ref_oid: str | None = None


@dataclass(frozen=True)
class PRDetails:
    """Detailed PR metadata needed for guarded merge workflows."""

    number: int
    head_ref_name: str
    base_ref_name: str
    head_ref_oid: str


@dataclass(frozen=True)
class PRMergeOutcome:
    """Successful guarded merge or auto-merge outcome for a PR."""

    number: int
    auto: bool


@dataclass(frozen=True)
class PRMergeResult:
    """Result of asking GitHub to merge or enable auto-merge for a PR."""

    number: int
    auto: bool
    stdout: str = ""
    stderr: str = ""


@dataclass(frozen=True)
class PRLookupError:
    """Error from looking up a PR for a branch.

    Returned when `gh pr view` fails — carries stderr and returncode so
    callers can distinguish "no PR found" from "gh CLI broken".
    """

    stderr: str
    returncode: int


@dataclass(frozen=True)
class PRCommandError:
    """Error from a mutating or status-oriented PR command."""

    stderr: str
    returncode: int


@dataclass(frozen=True)
class PRLookupMiss(PRLookupError):
    """Successful negative lookup: no PR matched the requested branch or key.

    Temporarily subclasses ``PRLookupError`` so existing PRGateway consumers
    that still branch on the old compatibility type stay green until they move
    to the unified PR-domain result types.
    """

    stderr: str = "no PR found"
    returncode: int = 1


@dataclass(frozen=True)
class PRGatewayFailure(PRLookupError, PRCommandError):
    """Failure while invoking gh/GitHub/auth/network/API operations.

    Temporarily subclasses the old error types so current consumers can keep
    recognizing failures while new PRGateway code switches to this name.
    """

    stderr: str
    returncode: int
    stdout: str = ""


@dataclass(frozen=True)
class PRReviewThreadState:
    """Post-mutation state for a PR review thread."""

    thread_id: str
    is_resolved: bool


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
