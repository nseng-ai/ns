"""Scenario tests for the standalone ``pr-address`` CLI.

Every exec operation is exercised through ``build_cli()`` — the top-level
standalone CLI entry point that users and skills invoke directly.
"""

import json

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.testing import FakeIssueGateway
from twerk_core.gh.types import (
    IssueComment,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRSummary,
)
from twerk_core.git.testing import FakeGitGateway
from twerk_pr_address.cli.main import build_cli
from twerk_pr_address.cli.pr_address.context import PrAddressCliContext


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _ctx(fake: FakeIssueGateway) -> PrAddressCliContext:
    return PrAddressCliContext(gh_issue_gateway=fake, git_gateway=FakeGitGateway())


def _invoke(
    cli_group: ClinkrGroup,
    args: list[str],
    fake: FakeIssueGateway,
) -> tuple[int, dict]:
    runner = CliRunner()
    ctx = _ctx(fake)
    result = runner.invoke(cli_group, args, obj=lambda: ctx)
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output


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


def test_subcommands_present(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])
    assert result.exit_code == 0
    assert "exec" in result.output


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
    fake = FakeIssueGateway(review_threads={42: [unresolved, resolved]})

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
    fake = FakeIssueGateway(review_threads={42: threads})

    exit_code, output = _invoke(
        cli_group, ["exec", "get-review-comments", "42", "--include-resolved"], fake
    )

    assert exit_code == 0
    assert output["count"] == 2


def test_get_review_comments_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["exec", "get-review-comments", "99"], fake)

    assert exit_code == 0
    assert output["count"] == 0
    assert output["threads"] == []


# -- get-discussion-comments --


def test_get_discussion_comments_returns_comments(cli_group: ClinkrGroup) -> None:
    comments = [
        IssueComment(id=1, body="Nice work", author="alice", url="https://example.com/1"),
        IssueComment(id=2, body="Fix the typo", author="bob", url="https://example.com/2"),
    ]
    fake = FakeIssueGateway(discussion_comments={42: comments})

    exit_code, output = _invoke(cli_group, ["exec", "get-discussion-comments", "42"], fake)

    assert exit_code == 0
    assert output["count"] == 2
    assert output["comments"][0]["author"] == "alice"


def test_get_discussion_comments_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

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
        IssueComment(
            id=1,
            author="Graphite Automations",
            body="Stack info",
            url="https://example.com/1",
        ),
    ]
    fake = FakeIssueGateway(
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
    # Discussion comments pass through as full IssueComment records — including
    # bot/Graphite comments that used to be pre-classified as informational.
    assert len(output["discussion_comments"]) == 1
    assert output["discussion_comments"][0]["author"] == "Graphite Automations"
    assert output["discussion_comments"][0]["body"] == "Stack info"


def test_get_feedback_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["exec", "get-feedback", "99"], fake)

    assert exit_code == 0
    assert output["pr_number"] == 99
    assert output["reviews"] == []
    assert output["review_threads"] == []
    assert output["discussion_comments"] == []


def test_get_feedback_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()
    ctx = _ctx(fake)
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "json", "get-feedback"],
        input='{"pr_number": 99}',
        obj=lambda: ctx,
    )

    assert result.exit_code == 0
    output = json.loads(result.output)
    assert output["success"] is True
    assert output["pr_number"] == 99


# -- resolve-thread --


def test_resolve_thread_calls_gateway_mutation(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["exec", "resolve-thread", "PRRT_abc"], fake)

    assert exit_code == 0
    assert output["thread_id"] == "PRRT_abc"
    assert output["was_already_resolved"] is False
    assert fake._resolved_thread_ids == ["PRRT_abc"]


def test_resolve_thread_second_call_reports_already_resolved(
    cli_group: ClinkrGroup,
) -> None:
    """The fake's instance-level tracking should flow through clinkr intact."""
    fake = FakeIssueGateway()

    first_exit, first_output = _invoke(cli_group, ["exec", "resolve-thread", "PRRT_abc"], fake)
    second_exit, second_output = _invoke(cli_group, ["exec", "resolve-thread", "PRRT_abc"], fake)

    assert first_exit == 0
    assert first_output["was_already_resolved"] is False
    assert second_exit == 0
    assert second_output["was_already_resolved"] is True
    assert fake._resolved_thread_ids == ["PRRT_abc", "PRRT_abc"]


# -- unresolve-thread --


def test_unresolve_thread_calls_gateway_mutation(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["exec", "unresolve-thread", "PRRT_abc"], fake)

    assert exit_code == 0
    assert output["thread_id"] == "PRRT_abc"
    assert output["was_already_unresolved"] is False
    assert fake._unresolved_thread_ids == ["PRRT_abc"]


def test_unresolve_thread_second_call_reports_already_unresolved(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()

    first_exit, first_output = _invoke(cli_group, ["exec", "unresolve-thread", "PRRT_abc"], fake)
    second_exit, second_output = _invoke(cli_group, ["exec", "unresolve-thread", "PRRT_abc"], fake)

    assert first_exit == 0
    assert first_output["was_already_unresolved"] is False
    assert second_exit == 0
    assert second_output["was_already_unresolved"] is True
    assert fake._unresolved_thread_ids == ["PRRT_abc", "PRRT_abc"]


# -- add-review-thread-reply --


def test_add_review_thread_reply_calls_gateway(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(
        cli_group,
        ["exec", "add-review-thread-reply", "PRRT_abc", "Fixed in commit def5678."],
        fake,
    )

    assert exit_code == 0
    assert fake._thread_replies == [("PRRT_abc", "Fixed in commit def5678.")]
    assert output["comment"]["body"] == "Fixed in commit def5678."
    assert output["comment"]["author"] == "fake-user"
    assert output["comment"]["id"] == 1


def test_add_review_thread_reply_preserves_multiline_body(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()
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
    assert fake._thread_replies == [("PRRT_abc", body)]
    # The full body (newlines, marker, italics) must survive the round-trip.
    assert output["comment"]["body"] == body


def test_add_review_thread_reply_reads_body_from_stdin_sentinel(
    cli_group: ClinkrGroup,
) -> None:
    """A `-` positional body argument means 'read the body from stdin'.

    This is the mechanism the twerk-pr-address skill uses with a shell
    heredoc to reliably pass multi-line bodies without escape-sequence
    quoting issues.
    """
    fake = FakeIssueGateway()
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
        obj=lambda: ctx,
        input=body,
    )

    assert result.exit_code == 0, result.output
    assert fake._thread_replies == [("PRRT_abc", body)]
    output = json.loads(result.output)
    assert output["comment"]["body"] == body


# -- get-pr-for-branch --


def test_get_pr_for_branch_returns_summary(cli_group: ClinkrGroup) -> None:
    pr = PRSummary(
        number=42,
        title="Add feature",
        url="https://github.com/dagster-io/twerk/pull/42",
        head_ref_name="feature",
        base_ref_name="master",
        state="OPEN",
    )
    fake = FakeIssueGateway(prs_by_branch={"feature": pr})

    exit_code, output = _invoke(cli_group, ["exec", "get-pr-for-branch", "feature"], fake)

    assert exit_code == 0
    assert output["found"] is True
    assert output["number"] == 42
    assert output["title"] == "Add feature"
    assert output["url"] == "https://github.com/dagster-io/twerk/pull/42"
    assert output["head_ref_name"] == "feature"
    assert output["base_ref_name"] == "master"
    assert output["state"] == "OPEN"


def test_get_pr_for_branch_no_pr_returns_not_found(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["exec", "get-pr-for-branch", "no-pr"], fake)

    assert exit_code == 0
    assert output["found"] is False
    assert output["error"] == "no PR found"
    assert output["returncode"] == 1


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
    fake = FakeIssueGateway(reviews={42: reviews})

    exit_code, output = _invoke(cli_group, ["exec", "get-reviews", "42"], fake)

    assert exit_code == 0
    assert output["count"] == 2
    assert output["reviews"][0]["id"] == "PRR_1"
    assert output["reviews"][0]["state"] == "CHANGES_REQUESTED"
    assert output["reviews"][1]["id"] == "PRR_2"
    assert output["reviews"][1]["author"] == "approver"


def test_get_reviews_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["exec", "get-reviews", "99"], fake)

    assert exit_code == 0
    assert output["count"] == 0
    assert output["reviews"] == []


# -- add-issue-comment --


def test_add_issue_comment_calls_gateway(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(
        cli_group,
        ["exec", "add-issue-comment", "42", "Addressed in latest commit."],
        fake,
    )

    assert exit_code == 0
    assert fake._comments == [(42, "Addressed in latest commit.")]
    assert output["comment"]["body"] == "Addressed in latest commit."
    assert output["comment"]["author"] == "fake-user"
    assert output["comment"]["id"] == 1


def test_add_issue_comment_reads_body_from_stdin_sentinel(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()
    ctx = _ctx(fake)
    body = "Addressed all review feedback.\n\n_Addressed via pr-address at 2026-04-12T12:00:00Z_"

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "add-issue-comment", "42", "-"],
        obj=lambda: ctx,
        input=body,
    )

    assert result.exit_code == 0, result.output
    assert fake._comments == [(42, body)]
    output = json.loads(result.output)
    assert output["comment"]["body"] == body


# -- add-reaction --


def test_add_reaction_calls_gateway(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(
        cli_group,
        ["exec", "add-reaction", "9001", "+1"],
        fake,
    )

    assert exit_code == 0
    assert fake._reactions == [(9001, "+1")]
    assert output["comment_id"] == 9001
    assert output["content"] == "+1"
    assert output["id"] == 1


# -- JSON-wrapper mode parity --


def _invoke_json(
    cli_group: ClinkrGroup,
    op: str,
    payload: dict,
    fake: FakeIssueGateway,
) -> tuple[int, dict]:
    runner = CliRunner()
    ctx = _ctx(fake)
    result = runner.invoke(
        cli_group,
        ["exec", "json", op],
        input=json.dumps(payload),
        obj=lambda: ctx,
    )
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output


def test_get_review_comments_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(cli_group, "get-review-comments", {"pr_number": 99}, fake)

    assert exit_code == 0
    assert output["success"] is True
    assert output["count"] == 0
    assert output["threads"] == []


def test_get_reviews_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(cli_group, "get-reviews", {"pr_number": 99}, fake)

    assert exit_code == 0
    assert output["success"] is True
    assert output["count"] == 0
    assert output["reviews"] == []


def test_get_discussion_comments_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(cli_group, "get-discussion-comments", {"pr_number": 99}, fake)

    assert exit_code == 0
    assert output["success"] is True
    assert output["count"] == 0
    assert output["comments"] == []


def test_get_pr_for_branch_json_mode(cli_group: ClinkrGroup) -> None:
    pr = PRSummary(
        number=42,
        title="Add feature",
        url="https://github.com/dagster-io/twerk/pull/42",
        head_ref_name="feature",
        base_ref_name="master",
        state="OPEN",
    )
    fake = FakeIssueGateway(prs_by_branch={"feature": pr})

    exit_code, output = _invoke_json(cli_group, "get-pr-for-branch", {"branch": "feature"}, fake)

    assert exit_code == 0
    assert output["success"] is True
    assert output["found"] is True
    assert output["number"] == 42
    assert output["state"] == "OPEN"


def test_resolve_thread_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(cli_group, "resolve-thread", {"thread_id": "PRRT_abc"}, fake)

    assert exit_code == 0
    assert output["success"] is True
    assert output["thread_id"] == "PRRT_abc"
    assert output["was_already_resolved"] is False
    assert fake._resolved_thread_ids == ["PRRT_abc"]


def test_unresolve_thread_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(cli_group, "unresolve-thread", {"thread_id": "PRRT_abc"}, fake)

    assert exit_code == 0
    assert output["success"] is True
    assert output["thread_id"] == "PRRT_abc"
    assert output["was_already_unresolved"] is False
    assert fake._unresolved_thread_ids == ["PRRT_abc"]


def test_add_review_thread_reply_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "add-review-thread-reply",
        {"thread_id": "PRRT_abc", "body": "Fixed."},
        fake,
    )

    assert exit_code == 0
    assert output["success"] is True
    assert output["comment"]["body"] == "Fixed."
    assert fake._thread_replies == [("PRRT_abc", "Fixed.")]


def test_add_issue_comment_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "add-issue-comment",
        {"pr_number": 42, "body": "Addressed."},
        fake,
    )

    assert exit_code == 0
    assert output["success"] is True
    assert output["comment"]["body"] == "Addressed."
    assert fake._comments == [(42, "Addressed.")]


def test_add_reaction_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke_json(
        cli_group,
        "add-reaction",
        {"comment_id": 9001, "reaction": "+1"},
        fake,
    )

    assert exit_code == 0
    assert output["success"] is True
    assert output["comment_id"] == 9001
    assert output["content"] == "+1"
    assert fake._reactions == [(9001, "+1")]


# -- Error-path smoke tests for mutations --
#
# Read-side error paths (unknown PR → empty result) are already covered by
# the `*_empty_pr` tests above. These tests lock in the gateway contract for
# mutations: unknown IDs silently succeed — the fake does not validate that
# the thread/PR/comment actually exists before recording the mutation.


def test_resolve_thread_unknown_thread_id_silently_succeeds(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["exec", "resolve-thread", "PRRT_does_not_exist"], fake)

    assert exit_code == 0
    assert output["thread_id"] == "PRRT_does_not_exist"
    assert output["was_already_resolved"] is False


def test_unresolve_thread_unknown_thread_id_silently_succeeds(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(
        cli_group, ["exec", "unresolve-thread", "PRRT_does_not_exist"], fake
    )

    assert exit_code == 0
    assert output["thread_id"] == "PRRT_does_not_exist"
    assert output["was_already_unresolved"] is False


def test_add_issue_comment_unknown_pr_silently_succeeds(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["exec", "add-issue-comment", "99999", "body"], fake)

    assert exit_code == 0
    assert fake._comments == [(99999, "body")]
    assert output["comment"]["body"] == "body"


def test_add_review_thread_reply_unknown_thread_id_silently_succeeds(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(
        cli_group,
        ["exec", "add-review-thread-reply", "PRRT_does_not_exist", "body"],
        fake,
    )

    assert exit_code == 0
    assert fake._thread_replies == [("PRRT_does_not_exist", "body")]
    assert output["comment"]["body"] == "body"


def test_add_reaction_unknown_comment_id_silently_succeeds(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["exec", "add-reaction", "99999", "+1"], fake)

    assert exit_code == 0
    assert fake._reactions == [(99999, "+1")]
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

    fake_default = FakeIssueGateway(review_threads={42: threads})
    exit_default, output_default = _invoke(cli_group, ["exec", "get-feedback", "42"], fake_default)
    assert exit_default == 0
    assert [t["id"] for t in output_default["review_threads"]] == ["PRRT_1"]

    fake_all = FakeIssueGateway(review_threads={42: threads})
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
    fake_default = FakeIssueGateway(reviews={42: reviews})
    exit_default, output_default = _invoke(cli_group, ["exec", "get-feedback", "42"], fake_default)
    assert exit_default == 0
    assert [r["id"] for r in output_default["reviews"]] == [
        "PRR_signal_commented",
        "PRR_signal_state",
    ]

    fake_all = FakeIssueGateway(reviews={42: reviews})
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
    fake = FakeIssueGateway()

    # `--` stops option parsing so reactions starting with `-` (e.g. `-1`)
    # aren't mistaken for short options.
    exit_code, output = _invoke(cli_group, ["exec", "add-reaction", "9001", "--", reaction], fake)

    assert exit_code == 0
    assert fake._reactions == [(9001, reaction)]
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
    fake = FakeIssueGateway(review_threads={42: [outdated]})

    exit_code, output = _invoke(cli_group, ["exec", "get-review-comments", "42"], fake)

    assert exit_code == 0
    assert output["count"] == 1
    assert output["threads"][0]["id"] == "PRRT_outdated"
    assert output["threads"][0]["is_outdated"] is True


def test_add_issue_comment_accepts_empty_body(cli_group: ClinkrGroup) -> None:
    """Contract: the CLI accepts an empty body and forwards it to the gateway."""
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["exec", "add-issue-comment", "42", ""], fake)

    assert exit_code == 0
    assert fake._comments == [(42, "")]
    assert output["comment"]["body"] == ""


def test_add_review_thread_reply_accepts_empty_body(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(
        cli_group, ["exec", "add-review-thread-reply", "PRRT_abc", ""], fake
    )

    assert exit_code == 0
    assert fake._thread_replies == [("PRRT_abc", "")]
    assert output["comment"]["body"] == ""


def test_resolve_then_unresolve_then_resolve_tracks_independently(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()

    _invoke(cli_group, ["exec", "resolve-thread", "PRRT_abc"], fake)
    _invoke(cli_group, ["exec", "unresolve-thread", "PRRT_abc"], fake)
    final_exit, final_output = _invoke(cli_group, ["exec", "resolve-thread", "PRRT_abc"], fake)

    assert final_exit == 0
    # The fake tracks resolve and unresolve in separate lists: two resolves
    # on the same thread flags `was_already_resolved=True` on the second,
    # regardless of an intervening unresolve.
    assert final_output["was_already_resolved"] is True
    assert fake._resolved_thread_ids == ["PRRT_abc", "PRRT_abc"]
    assert fake._unresolved_thread_ids == ["PRRT_abc"]
