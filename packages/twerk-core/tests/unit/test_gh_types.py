"""Tests for GitHub gateway domain types."""

import pytest

from twerk_core.gh.types import (
    Issue,
    IssueComment,
    PRReview,
    PRReviewComment,
    PRReviewThread,
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
        id=1, body="Issue here", author="rev", path="a.py", line=10, created_at=""
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


def test_issue_comment_construction():
    comment = IssueComment(
        id=456,
        body="Great work",
        author="commenter",
        url="https://github.com/org/repo/issues/1#issuecomment-456",
    )
    assert comment.id == 456
    assert comment.url.startswith("https://")


def test_issue_construction() -> None:
    issue = Issue(
        number=42,
        title="Add gh.issue gateway",
        state="open",
        updated_at="2026-04-08T12:00:00Z",
        url="https://github.com/org/repo/issues/42",
    )
    assert issue.number == 42
    assert issue.title == "Add gh.issue gateway"
    assert issue.state == "open"
    assert issue.updated_at == "2026-04-08T12:00:00Z"
    assert issue.url == "https://github.com/org/repo/issues/42"


def test_issue_is_frozen() -> None:
    issue = Issue(number=1, title="t", state="open", updated_at="", url="")
    with pytest.raises(AttributeError):
        # Test subject: mutating a frozen field.
        issue.title = "changed"  # type: ignore[misc]
