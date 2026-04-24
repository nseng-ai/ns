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
    needs for its Phase 0 preflight (number, title, URL, head/base refs) plus
    the lifecycle `state` used by `slot gc` to decide whether to reclaim the
    slot.
    """

    number: int
    title: str
    url: str
    head_ref_name: str
    base_ref_name: str
    state: PRState


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


# GitHub's check-runs API uses these three strings for the annotation severity.
AnnotationLevel = Literal["notice", "warning", "failure"]

# Conclusion values the reviewer will emit. The reviewer is informational, not
# merge-gating, so only `neutral` is used in practice — but the full type is
# kept so gateway consumers can read historical check runs that might have
# landed with a different conclusion.
CheckRunConclusion = Literal[
    "success",
    "neutral",
    "failure",
    "skipped",
    "cancelled",
    "timed_out",
    "action_required",
    "stale",
]

CheckRunStatus = Literal["queued", "in_progress", "completed"]


@dataclass(frozen=True)
class CheckRunAnnotation:
    """A single line-anchored annotation attached to a GitHub check run.

    Annotations carry per-finding signal in the "Files changed" view of a PR.
    GitHub's Checks API requires both ``start_line`` and ``end_line`` to be
    1-indexed, so findings without a usable line number must be rendered
    elsewhere (e.g. into the check run's ``output.text``) rather than
    anchored here.

    Attributes:
        path: File path the annotation anchors to (repository-relative).
        start_line: First line of the annotated range (1-indexed).
        end_line: Last line of the annotated range (1-indexed). Equal to
            ``start_line`` for single-line annotations.
        annotation_level: Severity, mapped from the reviewer's severity on the
            publishing side.
        message: Short, human-readable description of the finding. GitHub
            caps this at 64 KB.
        title: Optional short title rendered above the message. GitHub caps
            this at 255 characters.
        raw_details: Optional long-form detail shown in the expanded view.
    """

    path: str
    start_line: int
    end_line: int
    annotation_level: AnnotationLevel
    message: str
    title: str | None = None
    raw_details: str | None = None


@dataclass(frozen=True)
class CheckRunOutput:
    """The ``output`` block of a check run.

    Attributes:
        title: Short title shown at the top of the check in the GitHub UI.
        summary: Short markdown body shown above the annotations list.
        text: Optional long markdown body. The reviewer uses this for
            file-level findings that cannot be line-anchored (honours the
            "full visibility of all findings" invariant).
    """

    title: str
    summary: str
    text: str | None = None


@dataclass(frozen=True)
class CheckRun:
    """A GitHub check run attached to a commit SHA.

    Attributes:
        id: Numeric database ID — needed to append further annotations via
            PATCH.
        name: Check run name. The reviewer uses ``twerk-reviewer/<review-key>``
            so each reviewer pass has its own idempotency key.
        head_sha: Commit SHA the check run anchors to.
        status: Current status.
        conclusion: Terminal conclusion when status is ``completed``;
            ``None`` otherwise.
        html_url: Permalink to the check run in the GitHub UI.
    """

    id: int
    name: str
    head_sha: str
    status: CheckRunStatus
    conclusion: CheckRunConclusion | None
    html_url: str
