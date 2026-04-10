"""Tests for FakePRGateway."""

from twerk_core.gh.testing import FakePRGateway
from twerk_core.gh.types import (
    IssueComment,
    PRReview,
    PRReviewComment,
    PRReviewThread,
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


def test_get_review_threads_filters_resolved() -> None:
    resolved = _make_thread("PRRT_1", is_resolved=True)
    unresolved = _make_thread("PRRT_2", is_resolved=False)
    fake = FakePRGateway(review_threads={1: [resolved, unresolved]})

    result = fake.get_review_threads(1)
    assert len(result) == 1
    assert result[0].id == "PRRT_2"


def test_get_review_threads_include_resolved() -> None:
    resolved = _make_thread("PRRT_1", is_resolved=True)
    unresolved = _make_thread("PRRT_2", is_resolved=False)
    fake = FakePRGateway(review_threads={1: [resolved, unresolved]})

    result = fake.get_review_threads(1, include_resolved=True)
    assert len(result) == 2


def test_get_review_threads_missing_pr() -> None:
    fake = FakePRGateway()
    assert fake.get_review_threads(999) == ()


def test_get_reviews() -> None:
    review = PRReview(id="PRR_1", author="rev", body="LGTM", state="APPROVED", submitted_at="")
    fake = FakePRGateway(reviews={1: [review]})
    assert fake.get_reviews(1) == (review,)


def test_get_discussion_comments() -> None:
    comment = IssueComment(id=1, body="nice", author="user", url="https://example.com")
    fake = FakePRGateway(discussion_comments={1: [comment]})
    assert fake.get_discussion_comments(1) == (comment,)


def test_get_number_for_branch() -> None:
    fake = FakePRGateway(numbers_by_branch={"feature": 42})
    assert fake.get_number_for_branch("feature") == 42
    assert fake.get_number_for_branch("nonexistent") is None


def test_resolve_thread_tracks_mutations() -> None:
    fake = FakePRGateway()
    fake.resolve_review_thread("PRRT_1")
    fake.resolve_review_thread("PRRT_2")
    assert fake._resolved_thread_ids == ["PRRT_1", "PRRT_2"]


def test_unresolve_thread_tracks_mutations() -> None:
    fake = FakePRGateway()
    fake.unresolve_review_thread("PRRT_1")
    assert fake._unresolved_thread_ids == ["PRRT_1"]


def test_add_review_thread_reply_tracks() -> None:
    fake = FakePRGateway()
    fake.add_review_thread_reply("PRRT_1", "Fixed")
    assert fake._thread_replies == [("PRRT_1", "Fixed")]


def test_add_comment_returns_id_and_tracks() -> None:
    fake = FakePRGateway()
    comment_id = fake.add_comment(1, "Hello")
    assert comment_id == 1
    assert fake._comments == [(1, "Hello")]

    comment_id_2 = fake.add_comment(1, "World")
    assert comment_id_2 == 2


def test_add_reaction_tracks() -> None:
    fake = FakePRGateway()
    fake.add_reaction(123, "+1")
    assert fake._reactions == [(123, "+1")]
