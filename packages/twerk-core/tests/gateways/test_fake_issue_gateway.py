"""Tests for FakeIssueGateway."""

import pytest

from twerk_core.gh.testing import FakeIssueGateway
from twerk_core.gh.types import Issue, IssueComment, PRFile, PRReviewInlineComment


def _make_issue(number: int, *, state: str = "open") -> Issue:
    return Issue(
        number=number,
        title=f"Issue {number}",
        state=state,
        updated_at="2026-04-08T12:00:00Z",
        url=f"https://github.com/org/repo/issues/{number}",
    )


def _make_comment(
    comment_id: int,
    *,
    body: str,
    author: str,
) -> IssueComment:
    return IssueComment(
        id=comment_id,
        body=body,
        author=author,
        url=f"https://github.com/org/repo/pull/47#issuecomment-{comment_id}",
    )


def test_fake_issue_gateway_list_default_filters_open_only() -> None:
    fake = FakeIssueGateway(
        issues=(_make_issue(1, state="open"), _make_issue(2, state="closed")),
    )
    result = fake.list()
    assert tuple(i.number for i in result) == (1,)


def test_fake_issue_gateway_list_state_closed_filters_closed_only() -> None:
    fake = FakeIssueGateway(
        issues=(_make_issue(1, state="open"), _make_issue(2, state="closed")),
    )
    result = fake.list(state="closed")
    assert tuple(i.number for i in result) == (2,)


def test_fake_issue_gateway_list_state_all_returns_everything() -> None:
    issues = (_make_issue(1, state="open"), _make_issue(2, state="closed"))
    fake = FakeIssueGateway(issues=issues)
    assert fake.list(state="all") == issues


def test_fake_issue_gateway_list_label_argument_is_accepted_but_ignored() -> None:
    """The fake takes label for interface compatibility but does not filter on it.

    Tests seed the fake with the issues they want returned. Real callers
    rely on RealIssueGateway to apply label filtering server-side.
    """
    fake = FakeIssueGateway(issues=(_make_issue(1, state="open"),))
    assert fake.list(label="objective") == fake.list()


def test_fake_issue_gateway_list_empty_default() -> None:
    fake = FakeIssueGateway()
    assert fake.list() == ()


# -- find_comment_by_marker / update_comment --


_MARKER = "<!-- twerk-reviewer:dignified-python -->"
_BOT = "github-actions[bot]"


def test_find_comment_by_marker_returns_match_when_author_and_marker_align() -> None:
    fake = FakeIssueGateway(
        discussion_comments={
            47: [
                _make_comment(101, body=f"{_MARKER}\nFindings...", author=_BOT),
            ]
        },
    )
    found = fake.find_comment_by_marker(47, _MARKER, author_login=_BOT)
    assert found is not None
    assert found.id == 101


def test_find_comment_by_marker_skips_matching_marker_from_non_bot_author() -> None:
    """The bot-author check blocks a human from capturing the marker."""
    fake = FakeIssueGateway(
        discussion_comments={
            47: [
                _make_comment(101, body=f"{_MARKER}\nI can impersonate the bot!", author="alice"),
            ]
        },
    )
    assert fake.find_comment_by_marker(47, _MARKER, author_login=_BOT) is None


def test_find_comment_by_marker_skips_bot_author_with_different_marker() -> None:
    fake = FakeIssueGateway(
        discussion_comments={
            47: [
                _make_comment(
                    101,
                    body="<!-- twerk-reviewer:other-review -->\nFindings...",
                    author=_BOT,
                ),
            ]
        },
    )
    assert fake.find_comment_by_marker(47, _MARKER, author_login=_BOT) is None


def test_find_comment_by_marker_returns_none_when_pr_has_no_comments() -> None:
    fake = FakeIssueGateway()
    assert fake.find_comment_by_marker(47, _MARKER, author_login=_BOT) is None


def test_update_comment_replaces_body_and_tracks_mutation() -> None:
    fake = FakeIssueGateway(
        discussion_comments={
            47: [_make_comment(101, body=f"{_MARKER}\nold", author=_BOT)],
        },
    )
    updated = fake.update_comment(101, f"{_MARKER}\nnew")

    assert updated.id == 101
    assert updated.body == f"{_MARKER}\nnew"
    # Author and URL are preserved.
    assert updated.author == _BOT
    # Round-trip through find_comment_by_marker picks up the new body.
    refreshed = fake.find_comment_by_marker(47, _MARKER, author_login=_BOT)
    assert refreshed is not None
    assert refreshed.body == f"{_MARKER}\nnew"
    # Mutation tracking
    assert fake._updated_comments == [(101, f"{_MARKER}\nnew")]


def test_update_comment_raises_when_id_unknown() -> None:
    fake = FakeIssueGateway()
    with pytest.raises(KeyError):
        fake.update_comment(999, "body")


def test_add_comment_appends_to_discussion_comments_for_round_trip() -> None:
    """New comments posted via the fake must be findable on the next lookup."""
    fake = FakeIssueGateway()
    new_comment = fake.add_comment(47, f"{_MARKER}\nfresh")
    # The fake author is deterministic; tests that care about author identity
    # should seed the comment via `discussion_comments=` rather than relying on
    # `add_comment`'s placeholder author.
    assert fake.find_comment_by_marker(47, _MARKER, author_login=new_comment.author) is not None


# -- get_pr_files / submit_pr_review --


def test_get_pr_files_returns_seeded_files_for_pr() -> None:
    files = (
        PRFile(path="a.py", patch="@@ -1 +1 @@\n-old\n+new\n"),
        PRFile(path="b.py", patch=None),
    )
    fake = FakeIssueGateway(pr_files={47: files})
    assert fake.get_pr_files(47) == files


def test_get_pr_files_returns_empty_tuple_when_unseeded() -> None:
    fake = FakeIssueGateway()
    assert fake.get_pr_files(47) == ()


def test_submit_pr_review_tracks_submission_and_returns_fresh_id() -> None:
    fake = FakeIssueGateway()
    comments = (PRReviewInlineComment(path="a.py", line=10, body="nit"),)
    review_id = fake.submit_pr_review(
        47,
        commit_sha="deadbeef",
        body="summary body",
        comments=comments,
    )

    assert review_id == 1
    assert len(fake._submitted_reviews) == 1
    record = fake._submitted_reviews[0]
    assert record.id == 1
    assert record.pr_number == 47
    assert record.commit_sha == "deadbeef"
    assert record.body == "summary body"
    assert record.comments == comments


def test_submit_pr_review_issues_monotonically_increasing_ids() -> None:
    fake = FakeIssueGateway()
    first = fake.submit_pr_review(47, commit_sha="a", body="b1", comments=())
    second = fake.submit_pr_review(47, commit_sha="a", body="b2", comments=())
    assert (first, second) == (1, 2)
    assert [r.body for r in fake._submitted_reviews] == ["b1", "b2"]
