"""Tests for FakePRAddressGitHub."""

from twerk_pr_address.testing import FakePRAddressGitHub
from twerk_pr_address.types import (
    IssueComment,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    RestructuredFile,
)


def _make_thread(
    thread_id: str,
    *,
    is_resolved: bool = False,
    is_outdated: bool = False,
    path: str = "f.py",
) -> PRReviewThread:
    return PRReviewThread(
        id=thread_id,
        path=path,
        line=1,
        is_resolved=is_resolved,
        is_outdated=is_outdated,
        comments=(
            PRReviewComment(id=1, body="fix", author="rev", path=path, line=1, created_at=""),
        ),
    )


def test_get_review_threads_filters_resolved():
    resolved = _make_thread("PRRT_1", is_resolved=True)
    unresolved = _make_thread("PRRT_2", is_resolved=False)
    github = FakePRAddressGitHub(pr_review_threads={1: [resolved, unresolved]})

    result = github.get_pr_review_threads(1)
    assert len(result) == 1
    assert result[0].id == "PRRT_2"


def test_get_review_threads_include_resolved():
    resolved = _make_thread("PRRT_1", is_resolved=True)
    unresolved = _make_thread("PRRT_2", is_resolved=False)
    github = FakePRAddressGitHub(pr_review_threads={1: [resolved, unresolved]})

    result = github.get_pr_review_threads(1, include_resolved=True)
    assert len(result) == 2


def test_get_review_threads_missing_pr():
    github = FakePRAddressGitHub()
    assert github.get_pr_review_threads(999) == ()


def test_get_pr_reviews():
    review = PRReview(id="PRR_1", author="rev", body="LGTM", state="APPROVED", submitted_at="")
    github = FakePRAddressGitHub(pr_reviews={1: [review]})
    assert github.get_pr_reviews(1) == (review,)


def test_get_pr_discussion_comments():
    comment = IssueComment(id=1, body="nice", author="user", url="https://example.com")
    github = FakePRAddressGitHub(pr_discussion_comments={1: [comment]})
    assert github.get_pr_discussion_comments(1) == (comment,)


def test_get_pr_number_for_branch():
    github = FakePRAddressGitHub(pr_numbers_by_branch={"feature": 42})
    assert github.get_pr_number_for_branch("feature") == 42
    assert github.get_pr_number_for_branch("nonexistent") is None


def test_get_restructured_files():
    rf = RestructuredFile(status="R", old_path="a.py", new_path="b.py", similarity=90)
    github = FakePRAddressGitHub(restructured_files=(rf,))
    assert github.get_restructured_files("main") == (rf,)


def test_resolve_thread_tracks_mutations():
    github = FakePRAddressGitHub()
    assert github.resolve_review_thread("PRRT_1") is True
    assert github.resolve_review_thread("PRRT_2") is True
    assert github._resolved_thread_ids == ["PRRT_1", "PRRT_2"]


def test_resolve_thread_failures():
    github = FakePRAddressGitHub(resolve_thread_failures={"PRRT_bad"})
    assert github.resolve_review_thread("PRRT_bad") is False
    assert github.resolve_review_thread("PRRT_good") is True
    assert github._resolved_thread_ids == ["PRRT_good"]


def test_unresolve_thread_tracks_mutations():
    github = FakePRAddressGitHub()
    assert github.unresolve_review_thread("PRRT_1") is True
    assert github._unresolved_thread_ids == ["PRRT_1"]


def test_unresolve_thread_failures():
    github = FakePRAddressGitHub(unresolve_thread_failures={"PRRT_bad"})
    assert github.unresolve_review_thread("PRRT_bad") is False


def test_add_review_thread_reply_tracks():
    github = FakePRAddressGitHub()
    assert github.add_review_thread_reply("PRRT_1", "Fixed") is True
    assert github._thread_replies == [("PRRT_1", "Fixed")]


def test_add_pr_comment_returns_id_and_tracks():
    github = FakePRAddressGitHub(next_comment_id=500)
    comment_id = github.add_pr_comment(1, "Hello")
    assert comment_id == 500
    assert github._pr_comments == [(1, "Hello")]

    comment_id_2 = github.add_pr_comment(1, "World")
    assert comment_id_2 == 501


def test_add_reaction_tracks():
    github = FakePRAddressGitHub()
    assert github.add_reaction(123, "+1") is True
    assert github._reactions == [(123, "+1")]
