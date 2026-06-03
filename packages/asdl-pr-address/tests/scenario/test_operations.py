"""Scenario tests for the standalone ``pr-address`` CLI.

Every exec operation is exercised through ``build_cli()`` — the top-level
standalone CLI entry point that users and skills invoke directly.
"""

import json

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import (
    PRDiscussionComment,
    PRGatewayFailure,
    PRLookupMiss,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRSummary,
)
from asdl_core.git.testing import FakeGitGateway
from asdl_pr_address.cli.main import build_cli
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _ctx(fake: FakePRGateway) -> PrAddressCliContext:
    return PrAddressCliContext(pr_gateway=fake, git_gateway=FakeGitGateway())


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _invoke(
    cli_group: ClinkrGroup,
    args: list[str],
    fake: FakePRGateway,
) -> tuple[int, dict]:
    runner = CliRunner()
    ctx = _ctx(fake)
    result = runner.invoke(cli_group, args, obj=_obj(ctx))
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output


def _summary_pr(number: int = 42) -> PRSummary:
    return PRSummary(
        number=number,
        title="Add compact feedback",
        url=f"https://github.com/dagster-io/asdl/pull/{number}",
        head_ref_name="feature",
        base_ref_name="master",
        state="OPEN",
    )


def _summary_thread(
    thread_id: str,
    *,
    is_resolved: bool = False,
    comment_id: int = 1,
    body: str = "Please update this helper before merging.",
) -> PRReviewThread:
    return PRReviewThread(
        id=thread_id,
        path="src/app.py",
        line=10,
        start_line=8,
        is_resolved=is_resolved,
        is_outdated=False,
        comments=(
            PRReviewComment(
                id=comment_id,
                body=body,
                author="reviewer",
                path="src/app.py",
                line=10,
                start_line=8,
                created_at="2026-05-23T00:00:00Z",
            ),
        ),
    )


# -- standalone CLI smoke tests --


def test_version_option(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--version"])
    assert result.exit_code == 0
    assert "version" in result.output


def test_help_short_flag(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])
    assert result.exit_code == 0
    assert "PR review address operations." in result.output
    assert "--version" in result.output


def test_exec_group_is_hidden_from_top_level_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])
    assert result.exit_code == 0
    assert "exec" not in result.output


# -- get-review-comments --


def test_get_review_comments_returns_unresolved(cli_group: ClinkrGroup) -> None:
    unresolved = PRReviewThread(
        id="PRRT_1",
        path="file.py",
        line=10,
        is_resolved=False,
        is_outdated=False,
        comments=(
            PRReviewComment(
                id=1,
                body="Fix this",
                author="reviewer",
                path="file.py",
                line=10,
                created_at="2025-01-01T00:00:00Z",
            ),
        ),
    )
    resolved = PRReviewThread(
        id="PRRT_2",
        path="other.py",
        line=20,
        is_resolved=True,
        is_outdated=False,
        comments=(
            PRReviewComment(
                id=2,
                body="Done",
                author="reviewer",
                path="other.py",
                line=20,
                created_at="2025-01-01T00:00:00Z",
            ),
        ),
    )
    fake = FakePRGateway(review_threads={42: [unresolved, resolved]})

    exit_code, output = _invoke(cli_group, ["exec", "get-review-comments", "42"], fake)

    assert exit_code == 0
    assert output["count"] == 1
    assert output["threads"][0]["id"] == "PRRT_1"


def test_get_review_comments_include_resolved(cli_group: ClinkrGroup) -> None:
    threads = [
        PRReviewThread(
            id="PRRT_1",
            path="a.py",
            line=1,
            is_resolved=False,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=1,
                    body="x",
                    author="a",
                    path="a.py",
                    line=1,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
        PRReviewThread(
            id="PRRT_2",
            path="b.py",
            line=2,
            is_resolved=True,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=2,
                    body="y",
                    author="b",
                    path="b.py",
                    line=2,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
    ]
    fake = FakePRGateway(review_threads={42: threads})

    exit_code, output = _invoke(
        cli_group, ["exec", "get-review-comments", "42", "--include-resolved"], fake
    )

    assert exit_code == 0
    assert output["count"] == 2


def test_get_review_comments_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(cli_group, ["exec", "get-review-comments", "99"], fake)

    assert exit_code == 0
    assert output["count"] == 0
    assert output["threads"] == []


# -- get-discussion-comments --


def test_get_discussion_comments_returns_comments(cli_group: ClinkrGroup) -> None:
    comments = [
        PRDiscussionComment(id=1, body="Nice work", author="alice", url="https://example.com/1"),
        PRDiscussionComment(id=2, body="Fix the typo", author="bob", url="https://example.com/2"),
    ]
    fake = FakePRGateway(discussion_comments={42: comments})

    exit_code, output = _invoke(cli_group, ["exec", "get-discussion-comments", "42"], fake)

    assert exit_code == 0
    assert output["count"] == 2
    assert output["comments"][0]["author"] == "alice"


def test_get_discussion_comments_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(cli_group, ["exec", "get-discussion-comments", "99"], fake)

    assert exit_code == 0
    assert output["count"] == 0


# -- get-feedback --


def test_get_feedback_full_scenario(cli_group: ClinkrGroup) -> None:
    reviews = [
        PRReview(
            id="PRR_1",
            author="reviewer",
            body="Fix this",
            state="CHANGES_REQUESTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
        PRReview(
            id="PRR_2",
            author="reviewer",
            body="LGTM",
            state="APPROVED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
    ]
    threads = [
        PRReviewThread(
            id="PRRT_1",
            path="file.py",
            line=10,
            is_resolved=False,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=1,
                    body="Add tests",
                    author="reviewer",
                    path="file.py",
                    line=10,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
    ]
    comments = [
        PRDiscussionComment(
            id=1,
            author="Graphite Automations",
            body="Stack info",
            url="https://example.com/1",
        ),
    ]
    fake = FakePRGateway(
        reviews={42: reviews},
        review_threads={42: threads},
        discussion_comments={42: comments},
    )

    exit_code, output = _invoke(cli_group, ["exec", "get-feedback", "42"], fake)

    assert exit_code == 0
    assert output["pr_number"] == 42
    # All reviews pass through unfiltered — including APPROVED.
    assert len(output["reviews"]) == 2
    assert {r["id"] for r in output["reviews"]} == {"PRR_1", "PRR_2"}
    assert {r["state"] for r in output["reviews"]} == {"CHANGES_REQUESTED", "APPROVED"}
    # Threads pass through as full PRReviewThread records with nested comments.
    assert len(output["review_threads"]) == 1
    assert output["review_threads"][0]["id"] == "PRRT_1"
    assert output["review_threads"][0]["path"] == "file.py"
    assert len(output["review_threads"][0]["comments"]) == 1
    # Discussion comments pass through as full PRDiscussionComment records — including
    # bot/Graphite comments that used to be pre-classified as informational.
    assert len(output["discussion_comments"]) == 1
    assert output["discussion_comments"][0]["author"] == "Graphite Automations"
    assert output["discussion_comments"][0]["body"] == "Stack info"


def test_get_feedback_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(cli_group, ["exec", "get-feedback", "99"], fake)

    assert exit_code == 0
    assert output["pr_number"] == 99
    assert output["reviews"] == []
    assert output["review_threads"] == []
    assert output["discussion_comments"] == []


def test_get_feedback_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()
    ctx = _ctx(fake)
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "get-feedback", "99", "--format", "json"],
        obj=_obj(ctx),
    )

    assert result.exit_code == 0
    output = json.loads(result.output)
    assert output["exit_code"] == 0
    assert output["data"]["pr_number"] == 99


# -- summarize-feedback --


def test_summarize_feedback_returns_compact_summary(cli_group: ClinkrGroup) -> None:
    long_body = "Please update this helper before merging. " * 3
    reviews = [
        PRReview(
            id="PRR_1",
            author="reviewer",
            body="Please update the helper.\n\nDetails follow here.",
            state="CHANGES_REQUESTED",
            submitted_at="2026-05-23T00:00:00Z",
        )
    ]
    comments = [
        PRDiscussionComment(
            id=101,
            body="Human discussion comment with several words.",
            author="schrockn",
            url="https://example.com/comment/101",
        ),
        PRDiscussionComment(
            id=102,
            body="Stack metadata: https://app.graphite.com/github/pr/dagster-io/asdl/42",
            author="Graphite Automations",
            url="https://example.com/comment/102",
        ),
    ]
    fake = FakePRGateway(
        prs=[_summary_pr(42)],
        reviews={42: reviews},
        review_threads={
            42: [
                _summary_thread("PRRT_open", body=long_body),
                _summary_thread("PRRT_resolved", is_resolved=True, comment_id=2),
            ]
        },
        discussion_comments={42: comments},
    )

    exit_code, output = _invoke_json(
        cli_group,
        ["summarize-feedback", "42", "--body-chars", "40"],
        fake,
    )

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["found"] is True
    assert data["pr"] == {
        "number": 42,
        "title": "Add compact feedback",
        "url": "https://github.com/dagster-io/asdl/pull/42",
        "head_ref_name": "feature",
        "base_ref_name": "master",
        "state": "OPEN",
    }
    assert data["counts"] == {
        "reviews": 1,
        "review_threads": 2,
        "unresolved_review_threads": 1,
        "resolved_review_threads": 1,
        "discussion_comments": 2,
    }
    assert data["reviews"][0]["body_first_line_excerpt"] == "Please update the helper."
    assert data["review_threads"] == [
        {
            "thread_id": "PRRT_open",
            "path": "src/app.py",
            "line": 10,
            "start_line": 8,
            "is_outdated": False,
            "is_resolved": False,
            "comment_count": 1,
            "first_comment": {
                "id": 1,
                "author": "reviewer",
                "line": 10,
                "start_line": 8,
                "created_at": "2026-05-23T00:00:00Z",
                "body_first_line_excerpt": long_body.strip(),
                "body_excerpt": "Please update this helper before mergin…",
            },
        }
    ]
    assert data["discussion_comments"][0]["source_kind"] == "human_like"
    assert data["discussion_comments"][0]["source_evidence"] == []
    assert data["discussion_comments"][1]["source_kind"] == "automation_like"
    assert data["discussion_comments"][1]["source_evidence"] == ["graphite_link"]


def test_summarize_feedback_include_resolved_threads(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway(
        prs=[_summary_pr(42)],
        review_threads={
            42: [
                _summary_thread("PRRT_open"),
                _summary_thread("PRRT_resolved", is_resolved=True, comment_id=2),
            ]
        },
    )

    exit_code, output = _invoke_json(
        cli_group,
        ["summarize-feedback", "42", "--include-resolved"],
        fake,
    )

    assert exit_code == 0
    assert [thread["thread_id"] for thread in output["data"]["review_threads"]] == [
        "PRRT_open",
        "PRRT_resolved",
    ]
    assert output["data"]["review_threads"][1]["is_resolved"] is True


def test_summarize_feedback_filters_empty_reviews_by_default(cli_group: ClinkrGroup) -> None:
    reviews = [
        PRReview(
            id="PRR_noise_commented",
            author="reviewer",
            body="",
            state="COMMENTED",
            submitted_at="2026-05-23T00:00:00Z",
        ),
        PRReview(
            id="PRR_noise_approved",
            author="reviewer",
            body="   ",
            state="APPROVED",
            submitted_at="2026-05-23T00:00:00Z",
        ),
        PRReview(
            id="PRR_signal_state",
            author="reviewer",
            body="",
            state="CHANGES_REQUESTED",
            submitted_at="2026-05-23T00:00:00Z",
        ),
    ]

    fake_default = FakePRGateway(prs=[_summary_pr(42)], reviews={42: reviews})
    default_exit, default_output = _invoke_json(
        cli_group, ["summarize-feedback", "42"], fake_default
    )
    assert default_exit == 0
    assert [review["id"] for review in default_output["data"]["reviews"]] == ["PRR_signal_state"]
    assert default_output["data"]["counts"]["reviews"] == 1

    fake_all = FakePRGateway(prs=[_summary_pr(42)], reviews={42: reviews})
    all_exit, all_output = _invoke_json(
        cli_group, ["summarize-feedback", "42", "--include-empty-reviews"], fake_all
    )
    assert all_exit == 0
    assert [review["id"] for review in all_output["data"]["reviews"]] == [
        "PRR_noise_commented",
        "PRR_noise_approved",
        "PRR_signal_state",
    ]
    assert all_output["data"]["counts"]["reviews"] == 3


class FailingGetPrGateway(FakePRGateway):
    def get_pr(self, pr_number: int) -> PRSummary | PRLookupMiss | PRGatewayFailure:
        return PRGatewayFailure(stderr="gh auth failed", returncode=4)


def test_summarize_feedback_missing_pr_returns_negative_envelope(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(cli_group, ["summarize-feedback", "404"], fake)

    assert exit_code == 1
    assert output["exit_code"] == 1
    assert "No PR found" in output["message"]
    assert output["data"] == {
        "found": False,
        "pr_number": 404,
        "error": "no PR found for PR 404",
        "returncode": 1,
    }


def test_summarize_feedback_lookup_failure_returns_failure_envelope(
    cli_group: ClinkrGroup,
) -> None:
    fake = FailingGetPrGateway()

    exit_code, output = _invoke_json(cli_group, ["summarize-feedback", "42"], fake)

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "pr_gateway_failure"
    assert "PR 42" in output["message"]
    assert "gh auth failed" in output["message"]


@pytest.mark.parametrize(
    ("author", "body", "expected_evidence"),
    [
        ("github-actions[bot]", "Ordinary bot comment", ["bot_author"]),
        ("reviewer", "<!-- roaster: finding -->", ["roaster_marker"]),
        ("reviewer", "<!-- asdl-reviewer: finding -->", ["asdl_reviewer_marker"]),
        ("reviewer", "[vc]: deployment ready", ["vercel_marker"]),
        ("reviewer", "asset https://static.graphite.dev/check.svg", ["graphite_static_asset"]),
        ("reviewer", "Human feedback", []),
    ],
)
def test_summarize_feedback_discussion_source_evidence_is_mechanical(
    cli_group: ClinkrGroup,
    author: str,
    body: str,
    expected_evidence: list[str],
) -> None:
    fake = FakePRGateway(
        prs=[_summary_pr(42)],
        discussion_comments={
            42: [
                PRDiscussionComment(
                    id=101,
                    body=body,
                    author=author,
                    url="https://example.com/comment/101",
                )
            ]
        },
    )

    exit_code, output = _invoke_json(cli_group, ["summarize-feedback", "42"], fake)

    assert exit_code == 0
    comment = output["data"]["discussion_comments"][0]
    assert comment["source_evidence"] == expected_evidence
    expected_kind = "automation_like" if expected_evidence else "human_like"
    assert comment["source_kind"] == expected_kind


@pytest.mark.parametrize("body_chars", ["0", "-1", "4001"])
def test_summarize_feedback_rejects_invalid_body_chars(
    cli_group: ClinkrGroup,
    body_chars: str,
) -> None:
    fake = FakePRGateway(prs=[_summary_pr(42)])

    exit_code, output = _invoke_json(
        cli_group,
        ["summarize-feedback", "42", "--body-chars", body_chars],
        fake,
    )

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "invalid_request"
    assert "body_chars" in output["message"]


# -- resolve-thread --


def test_resolve_thread_calls_gateway_mutation(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(cli_group, ["exec", "resolve-thread", "PRRT_abc"], fake)

    assert exit_code == 0
    assert set(output) == {"thread_id", "is_resolved"}
    assert output["thread_id"] == "PRRT_abc"
    assert output["is_resolved"] is True
    assert fake.resolved_thread_ids == ("PRRT_abc",)


def test_resolve_thread_second_call_reports_post_state(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    first_exit, first_output = _invoke(cli_group, ["exec", "resolve-thread", "PRRT_abc"], fake)
    second_exit, second_output = _invoke(cli_group, ["exec", "resolve-thread", "PRRT_abc"], fake)

    assert first_exit == 0
    assert set(first_output) == {"thread_id", "is_resolved"}
    assert first_output["is_resolved"] is True
    assert second_exit == 0
    assert set(second_output) == {"thread_id", "is_resolved"}
    assert second_output["is_resolved"] is True
    assert fake.resolved_thread_ids == ("PRRT_abc", "PRRT_abc")


# -- unresolve-thread --


def test_unresolve_thread_calls_gateway_mutation(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(cli_group, ["exec", "unresolve-thread", "PRRT_abc"], fake)

    assert exit_code == 0
    assert set(output) == {"thread_id", "is_resolved"}
    assert output["thread_id"] == "PRRT_abc"
    assert output["is_resolved"] is False
    assert fake.unresolved_thread_ids == ("PRRT_abc",)


def test_unresolve_thread_second_call_reports_post_state(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    first_exit, first_output = _invoke(cli_group, ["exec", "unresolve-thread", "PRRT_abc"], fake)
    second_exit, second_output = _invoke(cli_group, ["exec", "unresolve-thread", "PRRT_abc"], fake)

    assert first_exit == 0
    assert set(first_output) == {"thread_id", "is_resolved"}
    assert first_output["is_resolved"] is False
    assert second_exit == 0
    assert set(second_output) == {"thread_id", "is_resolved"}
    assert second_output["is_resolved"] is False
    assert fake.unresolved_thread_ids == ("PRRT_abc", "PRRT_abc")


# -- add-review-thread-reply --


def test_add_review_thread_reply_calls_gateway(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(
        cli_group,
        ["exec", "add-review-thread-reply", "PRRT_abc", "Fixed in commit def5678."],
        fake,
    )

    assert exit_code == 0
    assert fake.thread_replies == (("PRRT_abc", "Fixed in commit def5678."),)
    assert output["comment"]["body"] == "Fixed in commit def5678."
    assert output["comment"]["author"] == "github-actions[bot]"
    assert output["comment"]["id"] == 1


def test_add_review_thread_reply_preserves_multiline_body(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    body = (
        "Fixed in commit abc1234: use LBYL.\n"
        "\n"
        "_Addressed via pr-address at 2026-04-10T12:00:00Z_\n"
        "<!-- pr-address:resolved -->"
    )

    exit_code, output = _invoke(
        cli_group,
        ["exec", "add-review-thread-reply", "PRRT_abc", body],
        fake,
    )

    assert exit_code == 0
    assert fake.thread_replies == (("PRRT_abc", body),)
    # The full body (newlines, marker, italics) must survive the round-trip.
    assert output["comment"]["body"] == body


def test_add_review_thread_reply_reads_body_from_stdin_sentinel(
    cli_group: ClinkrGroup,
) -> None:
    """A `-` positional body argument means 'read the body from stdin'.

    This is the mechanism the asdl-pr-address skill uses with a shell
    heredoc to reliably pass multi-line bodies without escape-sequence
    quoting issues.
    """
    fake = FakePRGateway()
    ctx = _ctx(fake)
    body = (
        "Fixed in commit abc1234: use LBYL.\n"
        "\n"
        "Addressed via _pr-address_ at 2026-04-10T12:00:00Z\n"
        "<!-- pr-address:resolved -->"
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "add-review-thread-reply", "PRRT_abc", "-"],
        obj=_obj(ctx),
        input=body,
    )

    assert result.exit_code == 0, result.output
    assert fake.thread_replies == (("PRRT_abc", body),)
    output = json.loads(result.output)
    assert output["comment"]["body"] == body


# -- get-pr-for-branch --


def test_get_pr_for_branch_returns_summary(cli_group: ClinkrGroup) -> None:
    pr = PRSummary(
        number=42,
        title="Add feature",
        url="https://github.com/dagster-io/asdl/pull/42",
        head_ref_name="feature",
        base_ref_name="master",
        state="OPEN",
    )
    fake = FakePRGateway(prs_by_branch={"feature": pr})

    exit_code, output = _invoke(cli_group, ["exec", "get-pr-for-branch", "feature"], fake)

    assert exit_code == 0
    assert output["found"] is True
    assert output["number"] == 42
    assert output["title"] == "Add feature"
    assert output["url"] == "https://github.com/dagster-io/asdl/pull/42"
    assert output["head_ref_name"] == "feature"
    assert output["base_ref_name"] == "master"
    assert output["state"] == "OPEN"


def test_get_pr_for_branch_no_pr_returns_not_found(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(cli_group, ["exec", "get-pr-for-branch", "no-pr"], fake)

    assert exit_code == 0
    assert output["found"] is False
    assert output["error"] == "no PR found"
    assert output["returncode"] == 1


class FailingLookupGateway(FakePRGateway):
    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupMiss | PRGatewayFailure:
        return PRGatewayFailure(stderr="gh auth failed", returncode=4)


def test_get_pr_for_branch_lookup_failure_returns_failure_envelope(
    cli_group: ClinkrGroup,
) -> None:
    fake = FailingLookupGateway()

    exit_code, payload = _invoke_json(cli_group, ["get-pr-for-branch", "feature"], fake)

    assert exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "pr_gateway_failure"
    assert "feature" in payload["message"]
    assert "gh auth failed" in payload["message"]


# -- get-reviews --


def test_get_reviews_returns_reviews(cli_group: ClinkrGroup) -> None:
    reviews = [
        PRReview(
            id="PRR_1",
            author="reviewer",
            body="Fix this",
            state="CHANGES_REQUESTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
        PRReview(
            id="PRR_2",
            author="approver",
            body="LGTM",
            state="APPROVED",
            submitted_at="2025-01-02T00:00:00Z",
        ),
    ]
    fake = FakePRGateway(reviews={42: reviews})

    exit_code, output = _invoke(cli_group, ["exec", "get-reviews", "42"], fake)

    assert exit_code == 0
    assert output["count"] == 2
    assert output["reviews"][0]["id"] == "PRR_1"
    assert output["reviews"][0]["state"] == "CHANGES_REQUESTED"
    assert output["reviews"][1]["id"] == "PRR_2"
    assert output["reviews"][1]["author"] == "approver"


def test_get_reviews_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(cli_group, ["exec", "get-reviews", "99"], fake)

    assert exit_code == 0
    assert output["count"] == 0
    assert output["reviews"] == []


# -- add-issue-comment --


def test_add_issue_comment_calls_gateway(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(
        cli_group,
        ["exec", "add-issue-comment", "42", "Addressed in latest commit."],
        fake,
    )

    assert exit_code == 0
    assert fake.comments == ((42, "Addressed in latest commit."),)
    assert output["comment"]["body"] == "Addressed in latest commit."
    assert output["comment"]["author"] == "github-actions[bot]"
    assert output["comment"]["id"] == 1


def test_add_issue_comment_reads_body_from_stdin_sentinel(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    ctx = _ctx(fake)
    body = "Addressed all review feedback.\n\n_Addressed via pr-address at 2026-04-12T12:00:00Z_"

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "add-issue-comment", "42", "-"],
        obj=_obj(ctx),
        input=body,
    )

    assert result.exit_code == 0, result.output
    assert fake.comments == ((42, body),)
    output = json.loads(result.output)
    assert output["comment"]["body"] == body


# -- add-reaction --


def test_add_reaction_calls_gateway(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(
        cli_group,
        ["exec", "add-reaction", "9001", "+1"],
        fake,
    )

    assert exit_code == 0
    assert fake.reactions == ((9001, "+1"),)
    assert output["comment_id"] == 9001
    assert output["content"] == "+1"
    assert output["id"] == 1


# -- JSON-wrapper mode parity --


def _invoke_json(
    cli_group: ClinkrGroup,
    args: list[str],
    fake: FakePRGateway,
) -> tuple[int, dict]:
    runner = CliRunner()
    ctx = _ctx(fake)
    result = runner.invoke(
        cli_group,
        ["exec", *args, "--format", "json"],
        obj=_obj(ctx),
    )
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output


def test_get_review_comments_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(cli_group, ["get-review-comments", "99"], fake)

    assert exit_code == 0
    assert output["exit_code"] == 0
    assert output["data"]["count"] == 0
    assert output["data"]["threads"] == []


def test_get_reviews_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(cli_group, ["get-reviews", "99"], fake)

    assert exit_code == 0
    assert output["exit_code"] == 0
    assert output["data"]["count"] == 0
    assert output["data"]["reviews"] == []


def test_get_discussion_comments_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(cli_group, ["get-discussion-comments", "99"], fake)

    assert exit_code == 0
    assert output["exit_code"] == 0
    assert output["data"]["count"] == 0
    assert output["data"]["comments"] == []


def test_get_pr_for_branch_json_mode(cli_group: ClinkrGroup) -> None:
    pr = PRSummary(
        number=42,
        title="Add feature",
        url="https://github.com/dagster-io/asdl/pull/42",
        head_ref_name="feature",
        base_ref_name="master",
        state="OPEN",
    )
    fake = FakePRGateway(prs_by_branch={"feature": pr})

    exit_code, output = _invoke_json(cli_group, ["get-pr-for-branch", "feature"], fake)

    assert exit_code == 0
    assert output["exit_code"] == 0
    assert output["data"]["found"] is True
    assert output["data"]["number"] == 42
    assert output["data"]["state"] == "OPEN"


def test_resolve_thread_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(cli_group, ["resolve-thread", "PRRT_abc"], fake)

    assert exit_code == 0
    assert output["exit_code"] == 0
    assert set(output["data"]) == {"thread_id", "is_resolved"}
    assert output["data"]["thread_id"] == "PRRT_abc"
    assert output["data"]["is_resolved"] is True
    assert fake.resolved_thread_ids == ("PRRT_abc",)


def test_unresolve_thread_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(cli_group, ["unresolve-thread", "PRRT_abc"], fake)

    assert exit_code == 0
    assert output["exit_code"] == 0
    assert set(output["data"]) == {"thread_id", "is_resolved"}
    assert output["data"]["thread_id"] == "PRRT_abc"
    assert output["data"]["is_resolved"] is False
    assert fake.unresolved_thread_ids == ("PRRT_abc",)


def test_add_review_thread_reply_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(
        cli_group,
        ["add-review-thread-reply", "PRRT_abc", "Fixed."],
        fake,
    )

    assert exit_code == 0
    assert output["exit_code"] == 0
    assert output["data"]["comment"]["body"] == "Fixed."
    assert fake.thread_replies == (("PRRT_abc", "Fixed."),)


def test_add_issue_comment_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(
        cli_group,
        ["add-issue-comment", "42", "Addressed."],
        fake,
    )

    assert exit_code == 0
    assert output["exit_code"] == 0
    assert output["data"]["comment"]["body"] == "Addressed."
    assert fake.comments == ((42, "Addressed."),)


def test_add_reaction_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(
        cli_group,
        ["add-reaction", "9001", "+1"],
        fake,
    )

    assert exit_code == 0
    assert output["exit_code"] == 0
    assert output["data"]["comment_id"] == 9001
    assert output["data"]["content"] == "+1"
    assert fake.reactions == ((9001, "+1"),)


# -- Error-path smoke tests for mutations --
#
# Read-side error paths (unknown PR → empty result) are already covered by
# the `*_empty_pr` tests above. These tests lock in the gateway contract for
# mutations: unknown IDs silently succeed — the fake does not validate that
# the thread/PR/comment actually exists before recording the mutation.


def test_resolve_thread_unknown_thread_id_silently_succeeds(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(cli_group, ["exec", "resolve-thread", "PRRT_does_not_exist"], fake)

    assert exit_code == 0
    assert set(output) == {"thread_id", "is_resolved"}
    assert output["thread_id"] == "PRRT_does_not_exist"
    assert output["is_resolved"] is True


def test_unresolve_thread_unknown_thread_id_silently_succeeds(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(
        cli_group, ["exec", "unresolve-thread", "PRRT_does_not_exist"], fake
    )

    assert exit_code == 0
    assert set(output) == {"thread_id", "is_resolved"}
    assert output["thread_id"] == "PRRT_does_not_exist"
    assert output["is_resolved"] is False


def test_add_issue_comment_unknown_pr_silently_succeeds(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(cli_group, ["exec", "add-issue-comment", "99999", "body"], fake)

    assert exit_code == 0
    assert fake.comments == ((99999, "body"),)
    assert output["comment"]["body"] == "body"


def test_add_review_thread_reply_unknown_thread_id_silently_succeeds(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(
        cli_group,
        ["exec", "add-review-thread-reply", "PRRT_does_not_exist", "body"],
        fake,
    )

    assert exit_code == 0
    assert fake.thread_replies == (("PRRT_does_not_exist", "body"),)
    assert output["comment"]["body"] == "body"


def test_add_reaction_unknown_comment_id_silently_succeeds(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(cli_group, ["exec", "add-reaction", "99999", "+1"], fake)

    assert exit_code == 0
    assert fake.reactions == ((99999, "+1"),)
    assert output["comment_id"] == 99999


# -- Flag coverage --


def test_get_feedback_include_resolved(cli_group: ClinkrGroup) -> None:
    threads = [
        PRReviewThread(
            id="PRRT_1",
            path="a.py",
            line=1,
            is_resolved=False,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=1,
                    body="x",
                    author="a",
                    path="a.py",
                    line=1,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
        PRReviewThread(
            id="PRRT_2",
            path="b.py",
            line=2,
            is_resolved=True,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=2,
                    body="y",
                    author="b",
                    path="b.py",
                    line=2,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
    ]

    fake_default = FakePRGateway(review_threads={42: threads})
    exit_default, output_default = _invoke(cli_group, ["exec", "get-feedback", "42"], fake_default)
    assert exit_default == 0
    assert [t["id"] for t in output_default["review_threads"]] == ["PRRT_1"]

    fake_all = FakePRGateway(review_threads={42: threads})
    exit_all, output_all = _invoke(
        cli_group, ["exec", "get-feedback", "42", "--include-resolved"], fake_all
    )
    assert exit_all == 0
    assert {t["id"] for t in output_all["review_threads"]} == {"PRRT_1", "PRRT_2"}


def test_get_feedback_filters_empty_reviews_by_default(cli_group: ClinkrGroup) -> None:
    reviews = [
        PRReview(
            id="PRR_noise_commented",
            author="reviewer",
            body="",
            state="COMMENTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
        PRReview(
            id="PRR_noise_approved",
            author="reviewer",
            body="   \n",
            state="APPROVED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
        PRReview(
            id="PRR_signal_commented",
            author="reviewer",
            body="Please take a look at X.",
            state="COMMENTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
        PRReview(
            id="PRR_signal_state",
            author="reviewer",
            body="",
            state="CHANGES_REQUESTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
    ]
    fake_default = FakePRGateway(reviews={42: reviews})
    exit_default, output_default = _invoke(cli_group, ["exec", "get-feedback", "42"], fake_default)
    assert exit_default == 0
    assert [r["id"] for r in output_default["reviews"]] == [
        "PRR_signal_commented",
        "PRR_signal_state",
    ]

    fake_all = FakePRGateway(reviews={42: reviews})
    exit_all, output_all = _invoke(
        cli_group, ["exec", "get-feedback", "42", "--include-empty-reviews"], fake_all
    )
    assert exit_all == 0
    assert [r["id"] for r in output_all["reviews"]] == [
        "PRR_noise_commented",
        "PRR_noise_approved",
        "PRR_signal_commented",
        "PRR_signal_state",
    ]


# -- Extras --


@pytest.mark.parametrize(
    "reaction",
    ["+1", "-1", "laugh", "hooray", "confused", "heart", "rocket", "eyes"],
)
def test_add_reaction_accepts_all_github_reactions(cli_group: ClinkrGroup, reaction: str) -> None:
    fake = FakePRGateway()

    # `--` stops option parsing so reactions starting with `-` (e.g. `-1`)
    # aren't mistaken for short options.
    exit_code, output = _invoke(cli_group, ["exec", "add-reaction", "9001", "--", reaction], fake)

    assert exit_code == 0
    assert fake.reactions == ((9001, reaction),)
    assert output["content"] == reaction


def test_get_review_comments_surfaces_outdated_flag(cli_group: ClinkrGroup) -> None:
    outdated = PRReviewThread(
        id="PRRT_outdated",
        path="a.py",
        line=10,
        is_resolved=False,
        is_outdated=True,
        comments=(
            PRReviewComment(
                id=1,
                body="old",
                author="reviewer",
                path="a.py",
                line=10,
                created_at="2025-01-01T00:00:00Z",
            ),
        ),
    )
    fake = FakePRGateway(review_threads={42: [outdated]})

    exit_code, output = _invoke(cli_group, ["exec", "get-review-comments", "42"], fake)

    assert exit_code == 0
    assert output["count"] == 1
    assert output["threads"][0]["id"] == "PRRT_outdated"
    assert output["threads"][0]["is_outdated"] is True


def test_add_issue_comment_accepts_empty_body(cli_group: ClinkrGroup) -> None:
    """Contract: the CLI accepts an empty body and forwards it to the gateway."""
    fake = FakePRGateway()

    exit_code, output = _invoke(cli_group, ["exec", "add-issue-comment", "42", ""], fake)

    assert exit_code == 0
    assert fake.comments == ((42, ""),)
    assert output["comment"]["body"] == ""


def test_add_review_thread_reply_accepts_empty_body(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(
        cli_group, ["exec", "add-review-thread-reply", "PRRT_abc", ""], fake
    )

    assert exit_code == 0
    assert fake.thread_replies == (("PRRT_abc", ""),)
    assert output["comment"]["body"] == ""


def test_resolve_then_unresolve_then_resolve_tracks_calls_but_reports_post_state(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    _invoke(cli_group, ["exec", "resolve-thread", "PRRT_abc"], fake)
    _invoke(cli_group, ["exec", "unresolve-thread", "PRRT_abc"], fake)
    final_exit, final_output = _invoke(cli_group, ["exec", "resolve-thread", "PRRT_abc"], fake)

    assert final_exit == 0
    assert set(final_output) == {"thread_id", "is_resolved"}
    assert final_output["is_resolved"] is True
    assert fake.resolved_thread_ids == ("PRRT_abc", "PRRT_abc")
    assert fake.unresolved_thread_ids == ("PRRT_abc",)


# -- --format json parity / --json-schema eagerness / failure envelope --


def test_get_reviews_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "get-reviews", "--json-schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_json_schema", "output_json_schema"}


def test_add_issue_comment_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "add-issue-comment", "--json-schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_json_schema", "output_json_schema"}


def test_reply_to_review_format_json_reports_failure(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()
    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "reply-to-review",
            "42",
            "reviewer",
            "   ",
            "--format",
            "json",
        ],
        obj=_obj(_ctx(fake)),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "invalid_request"
    assert "summary_markdown" in payload["message"]
