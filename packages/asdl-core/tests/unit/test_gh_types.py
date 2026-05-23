"""Tests for GitHub gateway domain types."""

import pytest

from asdl_core.gh.types import (
    PRDiscussionComment,
    PRGatewayFailure,
    PRLookupMiss,
    PRMergeOutcome,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRReviewThreadState,
    PRSummary,
)


def test_pr_review_comment_construction():
    comment = PRReviewComment(
        id=123,
        body="Fix this",
        author="reviewer",
        path="src/main.py",
        line=42,
        created_at="2024-01-01T00:00:00Z",
    )
    assert comment.id == 123
    assert comment.author == "reviewer"
    assert comment.line == 42


def test_pr_review_comment_none_line():
    comment = PRReviewComment(id=1, body="", author="a", path="f.py", line=None, created_at="")
    assert comment.line is None


def test_pr_review_comment_start_line_defaults_to_none():
    """`start_line` is optional; single-line threads omit it."""
    comment = PRReviewComment(id=1, body="", author="a", path="f.py", line=10, created_at="")
    assert comment.start_line is None


def test_pr_review_comment_multi_line_range():
    comment = PRReviewComment(
        id=1,
        body="",
        author="a",
        path="f.py",
        line=32,
        created_at="",
        start_line=27,
    )
    assert comment.start_line == 27
    assert comment.line == 32


def test_pr_review_comment_is_frozen():
    comment = PRReviewComment(id=1, body="x", author="a", path="f.py", line=1, created_at="")
    with pytest.raises(AttributeError):
        # Test subject: mutating a frozen field.
        comment.body = "changed"  # type: ignore[misc]


def test_pr_review_thread_construction():
    comment = PRReviewComment(
        id=1, body="Concern here", author="rev", path="a.py", line=10, created_at=""
    )
    thread = PRReviewThread(
        id="PRRT_abc123",
        path="a.py",
        line=10,
        is_resolved=False,
        is_outdated=False,
        comments=(comment,),
    )
    assert thread.id == "PRRT_abc123"
    assert len(thread.comments) == 1
    assert not thread.is_resolved


def test_pr_review_thread_is_frozen():
    thread = PRReviewThread(
        id="PRRT_1", path="f.py", line=1, is_resolved=False, is_outdated=False, comments=()
    )
    with pytest.raises(AttributeError):
        # Test subject: mutating a frozen field.
        thread.is_resolved = True  # type: ignore[misc]


def test_pr_review_thread_start_line_defaults_to_none():
    """`start_line` is optional; single-line threads omit it."""
    thread = PRReviewThread(
        id="PRRT_1", path="f.py", line=10, is_resolved=False, is_outdated=False, comments=()
    )
    assert thread.start_line is None


def test_pr_review_thread_multi_line_range():
    thread = PRReviewThread(
        id="PRRT_1",
        path="f.py",
        line=32,
        is_resolved=False,
        is_outdated=False,
        comments=(),
        start_line=27,
    )
    assert thread.start_line == 27
    assert thread.line == 32


def test_pr_review_construction():
    review = PRReview(
        id="PRR_abc",
        author="reviewer",
        body="Looks good",
        state="APPROVED",
        submitted_at="2024-01-01T00:00:00Z",
    )
    assert review.state == "APPROVED"
    assert review.author == "reviewer"


def test_pr_discussion_comment_construction_and_freeze() -> None:
    comment = PRDiscussionComment(
        id=456,
        body="Great work",
        author="commenter",
        url="https://github.com/org/repo/pull/1#issuecomment-456",
    )
    assert comment.id == 456
    assert comment.url.startswith("https://")
    with pytest.raises(AttributeError):
        # Test subject: mutating a frozen field.
        comment.body = "changed"  # type: ignore[misc]


def test_pr_lookup_miss_defaults_to_no_pr_found() -> None:
    miss = PRLookupMiss()
    assert miss.stderr == "no PR found"
    assert miss.returncode == 1


def test_pr_gateway_failure_preserves_diagnostics() -> None:
    failure = PRGatewayFailure(stderr="gh auth failed", returncode=4, stdout="debug")
    assert failure.stderr == "gh auth failed"
    assert failure.returncode == 4
    assert failure.stdout == "debug"


def test_pr_review_thread_state_construction_and_freeze() -> None:
    state = PRReviewThreadState(thread_id="PRRT_1", is_resolved=True)
    assert state.thread_id == "PRRT_1"
    assert state.is_resolved is True
    with pytest.raises(AttributeError):
        # Test subject: mutating a frozen field.
        state.is_resolved = False  # type: ignore[misc]


def test_pr_merge_outcome_construction() -> None:
    outcome = PRMergeOutcome(number=47, auto=True)
    assert outcome.number == 47
    assert outcome.auto is True


def test_pr_summary_head_ref_oid_defaults_to_none() -> None:
    summary = PRSummary(
        number=47,
        title="Add feature",
        url="https://github.com/org/repo/pull/47",
        head_ref_name="feature",
        base_ref_name="main",
        state="OPEN",
    )
    assert summary.head_ref_oid is None


def test_pr_summary_head_ref_oid_can_be_populated() -> None:
    summary = PRSummary(
        number=47,
        title="Add feature",
        url="https://github.com/org/repo/pull/47",
        head_ref_name="feature",
        base_ref_name="main",
        state="OPEN",
        head_ref_oid="abc123",
    )
    assert summary.head_ref_oid == "abc123"
