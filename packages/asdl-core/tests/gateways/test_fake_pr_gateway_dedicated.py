"""Tests for the dedicated FakePRGateway (separate from FakeIssueGateway)."""

from __future__ import annotations

from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import (
    PRChangedFile,
    PRDiscussionComment,
    PRGatewayFailure,
    PRInlineCommentInput,
    PRLookupMiss,
    PRMergeOutcome,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRReviewThreadState,
    PRState,
    PRSummary,
    Reaction,
)


def _make_pr(state: PRState, *, head_ref_oid: str | None = "abc123") -> PRSummary:
    return PRSummary(
        number=42,
        title="Add feature",
        url="https://github.com/dagster-io/asdl/pull/42",
        head_ref_name="feature",
        base_ref_name="master",
        state=state,
        head_ref_oid=head_ref_oid,
    )


def _make_thread(thread_id: str, *, is_resolved: bool = False) -> PRReviewThread:
    return PRReviewThread(
        id=thread_id,
        path="app.py",
        line=7,
        is_resolved=is_resolved,
        is_outdated=False,
        comments=(
            PRReviewComment(
                id=1,
                body="inline",
                author="reviewer",
                path="app.py",
                line=7,
                created_at="2026-05-23T00:00:00Z",
            ),
        ),
    )


def test_fake_pr_gateway_returns_seeded_pr_with_head_ref_oid() -> None:
    pr = _make_pr("OPEN", head_ref_oid="def456")
    fake = FakePRGateway(prs_by_branch={"feature": pr})

    assert fake.get_pr_for_branch("feature") == pr
    details = fake.get_pr_details_for_branch("feature")
    assert not isinstance(details, PRLookupMiss)
    assert details.head_ref_oid == "def456"


def test_fake_pr_gateway_returns_lookup_miss_when_missing() -> None:
    fake = FakePRGateway()

    result = fake.get_pr_for_branch("nonexistent")

    assert isinstance(result, PRLookupMiss)
    assert result.returncode == 1


def test_fake_pr_gateway_search_prs_filters_by_state_and_title() -> None:
    open_pr = _make_pr("OPEN")
    merged_pr = _make_pr("MERGED")
    fake = FakePRGateway(prs=[open_pr, merged_pr])

    result = fake.search_prs("feature", state="open")

    assert result == (open_pr,)
    all_result = fake.search_prs("", state="all")
    assert all_result == (open_pr, merged_pr)


def test_fake_pr_gateway_search_prs_can_return_failure() -> None:
    failure = PRGatewayFailure(stderr="gh failed", returncode=2)
    fake = FakePRGateway(search_failure=failure)

    assert fake.search_prs("feature", state="open") == failure


def test_fake_pr_gateway_returns_seeded_review_data() -> None:
    thread = _make_thread("PRRT_1")
    review = PRReview(
        id="PRR_1",
        author="reviewer",
        body="looks good",
        state="APPROVED",
        submitted_at="2026-05-23T00:00:00Z",
    )
    changed_file = PRChangedFile(path="app.py", status="modified", patch="@@")
    inline_comment = PRReviewComment(
        id=2,
        body="fix",
        author="reviewer",
        path="app.py",
        line=8,
        created_at="2026-05-23T00:00:00Z",
    )
    fake = FakePRGateway(
        review_threads={42: [thread]},
        reviews={42: [review]},
        pr_changed_files={42: [changed_file]},
        pr_review_comments={42: [inline_comment]},
    )

    assert fake.get_review_threads(42) == (thread,)
    assert fake.get_reviews(42) == (review,)
    assert fake.get_pr_changed_files(42) == (changed_file,)
    assert fake.get_pr_review_comments(42) == (inline_comment,)


def test_fake_pr_gateway_review_threads_filter_and_update_resolution_state() -> None:
    resolved = _make_thread("PRRT_resolved", is_resolved=True)
    unresolved = _make_thread("PRRT_open", is_resolved=False)
    fake = FakePRGateway(review_threads={42: [resolved, unresolved]})

    assert fake.get_review_threads(42) == (unresolved,)
    assert fake.get_review_threads(42, include_resolved=True) == (resolved, unresolved)

    resolved_state = fake.resolve_review_thread("PRRT_open")
    assert resolved_state == PRReviewThreadState(thread_id="PRRT_open", is_resolved=True)
    assert fake.get_review_threads(42) == ()

    unresolved_state = fake.unresolve_review_thread("PRRT_open")
    assert unresolved_state == PRReviewThreadState(thread_id="PRRT_open", is_resolved=False)
    assert fake.get_review_threads(42) == (unresolved,)
    assert fake.resolved_thread_ids == ("PRRT_open",)
    assert fake.unresolved_thread_ids == ("PRRT_open",)


def test_fake_pr_gateway_discussion_comment_round_trip() -> None:
    seeded = PRDiscussionComment(
        id=101,
        body="<!-- marker --> old",
        author="github-actions[bot]",
        url="https://example.com/101",
    )
    fake = FakePRGateway(discussion_comments={42: [seeded]})

    assert fake.get_discussion_comments(42) == (seeded,)
    assert fake.get_pr_discussion_comments(42) == (seeded,)
    created = fake.add_pr_discussion_comment(42, "<!-- marker --> new")
    assert isinstance(created, PRDiscussionComment)
    assert created.author == "github-actions[bot]"
    assert (
        fake.find_pr_discussion_comment_by_marker(42, "<!-- marker -->", "github-actions[bot]")
        == seeded
    )

    updated = fake.update_pr_discussion_comment(created.id, "updated")

    assert updated.body == "updated"
    assert fake.updated_comments == ((created.id, "updated"),)
    assert fake.comments == ((42, "<!-- marker --> new"),)


def test_fake_pr_gateway_adds_reaction_and_tracks_it() -> None:
    fake = FakePRGateway()

    reaction = fake.add_pr_discussion_comment_reaction(101, "+1")

    assert reaction == Reaction(id=1, comment_id=101, content="+1")
    assert fake.reactions == ((101, "+1"),)


def test_fake_pr_gateway_add_review_thread_reply_tracks_and_updates_thread() -> None:
    thread = _make_thread("PRRT_1")
    fake = FakePRGateway(review_threads={42: [thread]})

    reply = fake.add_review_thread_reply("PRRT_1", "fixed")

    assert reply.body == "fixed"
    assert fake.thread_replies == (("PRRT_1", "fixed"),)
    updated_thread = fake.get_review_threads(42)[0]
    assert updated_thread.comments[-1] == reply


def test_fake_pr_gateway_create_review_returns_review_and_appends_comments() -> None:
    fake = FakePRGateway()
    comments = (
        PRInlineCommentInput(path="app.py", line=7, body="first"),
        PRInlineCommentInput(path="other.py", line=9, body="second"),
    )

    review = fake.create_pr_review(42, comments)

    assert review == PRReview(
        id="fake-review-1",
        author="github-actions[bot]",
        state="COMMENTED",
        body="",
        submitted_at="",
    )
    assert fake.created_reviews == ((42, comments),)
    review_comments = fake.get_pr_review_comments(42)
    assert tuple(comment.body for comment in review_comments) == ("first", "second")
    assert fake.get_reviews(42) == (review,)


def test_fake_pr_gateway_merge_returns_outcome_and_tracks_calls() -> None:
    fake = FakePRGateway()

    result = fake.merge_pr(42, match_head_commit="abc123", admin=True, auto=True)

    assert result == PRMergeOutcome(number=42, auto=True)
    assert fake.merge_calls == ((42, "abc123", True, True),)


def test_fake_pr_gateway_merge_can_return_failure() -> None:
    failure = PRGatewayFailure(stderr="head changed", returncode=1)
    fake = FakePRGateway(merge_failure=failure)

    result = fake.merge_pr(42, match_head_commit="abc123", admin=False, auto=False)

    assert result == failure
    assert fake.merge_calls == ((42, "abc123", False, False),)
