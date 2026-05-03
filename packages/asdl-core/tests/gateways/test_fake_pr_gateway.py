"""Tests for the PR-side methods of FakeIssueGateway."""

from asdl_core.gh.testing import FakeIssueGateway
from asdl_core.gh.types import (
    IssueComment,
    PRLookupError,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRSummary,
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
    fake = FakeIssueGateway(review_threads={1: [resolved, unresolved]})

    result = fake.get_review_threads(1)
    assert len(result) == 1
    assert result[0].id == "PRRT_2"


def test_get_review_threads_include_resolved() -> None:
    resolved = _make_thread("PRRT_1", is_resolved=True)
    unresolved = _make_thread("PRRT_2", is_resolved=False)
    fake = FakeIssueGateway(review_threads={1: [resolved, unresolved]})

    result = fake.get_review_threads(1, include_resolved=True)
    assert len(result) == 2


def test_get_review_threads_missing_pr() -> None:
    fake = FakeIssueGateway()
    assert fake.get_review_threads(999) == ()


def test_get_reviews() -> None:
    review = PRReview(id="PRR_1", author="rev", body="LGTM", state="APPROVED", submitted_at="")
    fake = FakeIssueGateway(reviews={1: [review]})
    assert fake.get_reviews(1) == (review,)


def test_get_discussion_comments() -> None:
    comment = IssueComment(id=1, body="nice", author="user", url="https://example.com")
    fake = FakeIssueGateway(discussion_comments={1: [comment]})
    assert fake.get_discussion_comments(1) == (comment,)


def test_get_pr_for_branch() -> None:
    pr = PRSummary(
        number=42,
        title="Add feature",
        url="https://github.com/dagster-io/asdl/pull/42",
        head_ref_name="feature",
        base_ref_name="master",
        state="OPEN",
    )
    fake = FakeIssueGateway(prs_by_branch={"feature": pr})
    assert fake.get_pr_for_branch("feature") == pr
    result = fake.get_pr_for_branch("nonexistent")
    assert isinstance(result, PRLookupError)
    assert result.returncode == 1


def test_resolve_thread_returns_result_and_tracks_repeat() -> None:
    fake = FakeIssueGateway()

    first = fake.resolve_review_thread("PRRT_1")
    assert first.thread_id == "PRRT_1"
    assert first.was_already_resolved is False

    second = fake.resolve_review_thread("PRRT_1")
    assert second.was_already_resolved is True

    assert fake._resolved_thread_ids == ["PRRT_1", "PRRT_1"]


def test_unresolve_thread_returns_result_and_tracks_repeat() -> None:
    fake = FakeIssueGateway()

    first = fake.unresolve_review_thread("PRRT_1")
    assert first.thread_id == "PRRT_1"
    assert first.was_already_unresolved is False

    second = fake.unresolve_review_thread("PRRT_1")
    assert second.was_already_unresolved is True

    assert fake._unresolved_thread_ids == ["PRRT_1", "PRRT_1"]


def test_add_review_thread_reply_returns_comment() -> None:
    fake = FakeIssueGateway()
    reply = fake.add_review_thread_reply("PRRT_1", "Fixed")
    assert isinstance(reply, PRReviewComment)
    assert reply.body == "Fixed"
    assert reply.id == 1
    assert fake._thread_replies == [("PRRT_1", "Fixed")]


def test_add_comment_returns_full_comment() -> None:
    fake = FakeIssueGateway()
    comment = fake.add_comment(1, "Hello")
    assert isinstance(comment, IssueComment)
    assert comment.id == 1
    assert comment.body == "Hello"
    assert "1#issuecomment-1" in comment.url
    assert fake._comments == [(1, "Hello")]

    second = fake.add_comment(1, "World")
    assert second.id == 2


def test_add_reaction_returns_reaction() -> None:
    fake = FakeIssueGateway()
    reaction = fake.add_reaction(123, "+1")
    assert reaction.id == 1
    assert reaction.comment_id == 123
    assert reaction.content == "+1"
    assert fake._reactions == [(123, "+1")]
