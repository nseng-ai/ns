"""Unit tests for PR feedback snapshot policy."""

from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import (
    PRDiscussionComment,
    PRReview,
    PRReviewComment,
    PRReviewState,
    PRReviewThread,
)
from asdl_pr_address.cli.pr_address.feedback_snapshot import fetch_feedback_snapshot


def _review(
    review_id: str,
    *,
    state: PRReviewState = "COMMENTED",
    body: str = "",
) -> PRReview:
    return PRReview(
        id=review_id,
        author="reviewer",
        body=body,
        state=state,
        submitted_at="2026-05-23T00:00:00Z",
    )


def _reviews_with_empty_noise() -> tuple[PRReview, ...]:
    return (
        _review("empty_commented", state="COMMENTED", body=""),
        _review("empty_approved", state="APPROVED", body="   "),
        _review("empty_changes_requested", state="CHANGES_REQUESTED", body=""),
        _review("empty_dismissed", state="DISMISSED", body=""),
        _review("non_empty_approved", state="APPROVED", body="Looks good."),
    )


def _thread(thread_id: str, *, is_resolved: bool = False) -> PRReviewThread:
    return PRReviewThread(
        id=thread_id,
        path="src/app.py",
        line=10,
        is_resolved=is_resolved,
        is_outdated=False,
        comments=(
            PRReviewComment(
                id=1,
                body="Please update this helper.",
                author="reviewer",
                path="src/app.py",
                line=10,
                created_at="2026-05-23T00:00:00Z",
            ),
        ),
    )


def _discussion(comment_id: int = 1) -> PRDiscussionComment:
    return PRDiscussionComment(
        id=comment_id,
        body="Top-level PR discussion.",
        author="reviewer",
        url=f"https://github.com/dagster-io/asdl/pull/42#issuecomment-{comment_id}",
    )


def test_feedback_snapshot_filters_empty_reviews_by_default() -> None:
    fake = FakePRGateway(reviews={42: _reviews_with_empty_noise()})

    snapshot = fetch_feedback_snapshot(
        fake,
        pr_number=42,
        include_empty_reviews=False,
        include_resolved=False,
    )

    assert [review.id for review in snapshot.reviews] == [
        "empty_changes_requested",
        "empty_dismissed",
        "non_empty_approved",
    ]


def test_feedback_snapshot_include_empty_reviews_preserves_all_reviews() -> None:
    reviews = _reviews_with_empty_noise()
    fake = FakePRGateway(reviews={42: reviews})

    snapshot = fetch_feedback_snapshot(
        fake,
        pr_number=42,
        include_empty_reviews=True,
        include_resolved=False,
    )

    assert snapshot.reviews == reviews


def test_feedback_snapshot_returns_visible_threads_without_resolved_by_default() -> None:
    unresolved = _thread("unresolved")
    resolved = _thread("resolved", is_resolved=True)
    fake = FakePRGateway(review_threads={42: [unresolved, resolved]})

    snapshot = fetch_feedback_snapshot(
        fake,
        pr_number=42,
        include_empty_reviews=False,
        include_resolved=False,
    )

    assert snapshot.review_threads == (unresolved,)
    assert snapshot.counted_review_threads == snapshot.review_threads


def test_feedback_snapshot_can_count_all_threads_while_returning_unresolved() -> None:
    unresolved = _thread("unresolved")
    resolved = _thread("resolved", is_resolved=True)
    fake = FakePRGateway(review_threads={42: [unresolved, resolved]})

    snapshot = fetch_feedback_snapshot(
        fake,
        pr_number=42,
        include_empty_reviews=False,
        include_resolved=False,
        count_all_review_threads=True,
    )

    assert snapshot.review_threads == (unresolved,)
    assert snapshot.counted_review_threads == (unresolved, resolved)


def test_feedback_snapshot_include_resolved_returns_all_threads() -> None:
    unresolved = _thread("unresolved")
    resolved = _thread("resolved", is_resolved=True)
    fake = FakePRGateway(review_threads={42: [unresolved, resolved]})

    snapshot = fetch_feedback_snapshot(
        fake,
        pr_number=42,
        include_empty_reviews=False,
        include_resolved=True,
        count_all_review_threads=True,
    )

    assert snapshot.review_threads == (unresolved, resolved)
    assert snapshot.counted_review_threads == (unresolved, resolved)


def test_feedback_snapshot_includes_discussion_comments_unchanged() -> None:
    comments = (_discussion(1), _discussion(2))
    fake = FakePRGateway(discussion_comments={42: comments})

    snapshot = fetch_feedback_snapshot(
        fake,
        pr_number=42,
        include_empty_reviews=False,
        include_resolved=False,
    )

    assert snapshot.discussion_comments == comments
