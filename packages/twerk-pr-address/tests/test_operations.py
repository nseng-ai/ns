"""Tests for clinkr operations via CliRunner with FakeIssueGateway."""

import json
import subprocess

import pytest
from click.testing import CliRunner

from clinkr.group import ClinkrGroup, discover_group
from twerk_core.gh import real_issue_gateway
from twerk_core.gh.testing import FakeIssueGateway
from twerk_core.gh.types import (
    IssueComment,
    PRReview,
    PRReviewComment,
    PRReviewThread,
)


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return discover_group("twerk_pr_address.cli.pr_address")


def _invoke(
    cli_group: ClinkrGroup,
    args: list[str],
    fake: FakeIssueGateway,
) -> tuple[int, dict]:
    runner = CliRunner()
    result = runner.invoke(cli_group, args, obj={"gh_issue_gateway": fake})
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output


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

    exit_code, output = _invoke(cli_group, ["get-review-comments", "42"], fake)

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
        cli_group, ["get-review-comments", "42", "--include-resolved"], fake
    )

    assert exit_code == 0
    assert output["count"] == 2


def test_get_review_comments_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["get-review-comments", "99"], fake)

    assert exit_code == 0
    assert output["count"] == 0
    assert output["threads"] == []


def test_get_review_comments_falls_back_to_real_gateway(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """End-to-end: `twerk pr-address get-review-comments` with no gateway injected.

    When a real user runs the command, nothing populates
    `ctx.obj["gh_issue_gateway"]`, so `_gateway_access.get_gh_issue_gateway()`
    falls back to `RealIssueGateway()`. Every other test in this file
    short-circuits that fallback by injecting a `FakeIssueGateway` via
    `obj=...`, so the fallback path would otherwise be uncovered. This test
    walks it with `gh` stubbed out.
    """
    owner_repo_output = json.dumps({"owner": {"login": "dagster-io"}, "name": "twerk"})
    graphql_payload = json.dumps(
        {
            "data": {
                "repository": {
                    "pullRequest": {
                        "reviewThreads": {
                            "nodes": [
                                {
                                    "id": "PRRT_real",
                                    "isResolved": False,
                                    "isOutdated": False,
                                    "path": "src/foo.py",
                                    "line": 42,
                                    "comments": {
                                        "nodes": [
                                            {
                                                "databaseId": 9001,
                                                "body": "nit: rename",
                                                "author": {"login": "reviewer"},
                                                "path": "src/foo.py",
                                                "line": 42,
                                                "createdAt": "2026-04-10T12:00:00Z",
                                            }
                                        ]
                                    },
                                }
                            ]
                        }
                    }
                }
            }
        }
    )

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["gh", "repo", "view"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=owner_repo_output, stderr="")
        if cmd[:3] == ["gh", "api", "graphql"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=graphql_payload, stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(real_issue_gateway.subprocess, "run", fake_run)

    runner = CliRunner()
    # Deliberately no obj= — force the production fallback to RealIssueGateway.
    result = runner.invoke(cli_group, ["get-review-comments", "47"])

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["count"] == 1
    assert output["threads"][0]["id"] == "PRRT_real"
    assert output["threads"][0]["comments"][0]["author"] == "reviewer"


# -- get-discussion-comments --


def test_get_discussion_comments_returns_comments(cli_group: ClinkrGroup) -> None:
    comments = [
        IssueComment(id=1, body="Nice work", author="alice", url="https://example.com/1"),
        IssueComment(id=2, body="Fix the typo", author="bob", url="https://example.com/2"),
    ]
    fake = FakeIssueGateway(discussion_comments={42: comments})

    exit_code, output = _invoke(cli_group, ["get-discussion-comments", "42"], fake)

    assert exit_code == 0
    assert output["count"] == 2
    assert output["comments"][0]["author"] == "alice"


def test_get_discussion_comments_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["get-discussion-comments", "99"], fake)

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

    exit_code, output = _invoke(cli_group, ["get-feedback", "42"], fake)

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

    exit_code, output = _invoke(cli_group, ["get-feedback", "99"], fake)

    assert exit_code == 0
    assert output["pr_number"] == 99
    assert output["reviews"] == []
    assert output["review_threads"] == []
    assert output["discussion_comments"] == []


def test_get_feedback_json_mode(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["json", "get-feedback"],
        input='{"pr_number": 99}',
        obj={"gh_issue_gateway": fake},
    )

    assert result.exit_code == 0
    output = json.loads(result.output)
    assert output["success"] is True
    assert output["pr_number"] == 99


# -- resolve-thread --


def test_resolve_thread_calls_gateway_mutation(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["resolve-thread", "PRRT_abc"], fake)

    assert exit_code == 0
    assert output["thread_id"] == "PRRT_abc"
    assert output["was_already_resolved"] is False
    assert fake._resolved_thread_ids == ["PRRT_abc"]


def test_resolve_thread_second_call_reports_already_resolved(
    cli_group: ClinkrGroup,
) -> None:
    """The fake's instance-level tracking should flow through clinkr intact."""
    fake = FakeIssueGateway()

    first_exit, first_output = _invoke(cli_group, ["resolve-thread", "PRRT_abc"], fake)
    second_exit, second_output = _invoke(cli_group, ["resolve-thread", "PRRT_abc"], fake)

    assert first_exit == 0
    assert first_output["was_already_resolved"] is False
    assert second_exit == 0
    assert second_output["was_already_resolved"] is True
    assert fake._resolved_thread_ids == ["PRRT_abc", "PRRT_abc"]


def test_resolve_thread_falls_back_to_real_gateway(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Walks the DI fallback to RealIssueGateway with subprocess stubbed."""
    resolve_payload = json.dumps(
        {"data": {"resolveReviewThread": {"thread": {"id": "PRRT_real", "isResolved": True}}}}
    )

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["gh", "api", "graphql"]:
            joined = " ".join(cmd)
            assert "threadId=PRRT_real" in joined
            assert "resolveReviewThread" in joined
            return subprocess.CompletedProcess(cmd, 0, stdout=resolve_payload, stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(real_issue_gateway.subprocess, "run", fake_run)

    runner = CliRunner()
    result = runner.invoke(cli_group, ["resolve-thread", "PRRT_real"])

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["thread_id"] == "PRRT_real"
    assert output["was_already_resolved"] is False


# -- unresolve-thread --


def test_unresolve_thread_calls_gateway_mutation(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["unresolve-thread", "PRRT_abc"], fake)

    assert exit_code == 0
    assert output["thread_id"] == "PRRT_abc"
    assert output["was_already_unresolved"] is False
    assert fake._unresolved_thread_ids == ["PRRT_abc"]


def test_unresolve_thread_second_call_reports_already_unresolved(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()

    first_exit, first_output = _invoke(cli_group, ["unresolve-thread", "PRRT_abc"], fake)
    second_exit, second_output = _invoke(cli_group, ["unresolve-thread", "PRRT_abc"], fake)

    assert first_exit == 0
    assert first_output["was_already_unresolved"] is False
    assert second_exit == 0
    assert second_output["was_already_unresolved"] is True
    assert fake._unresolved_thread_ids == ["PRRT_abc", "PRRT_abc"]


def test_unresolve_thread_falls_back_to_real_gateway(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    unresolve_payload = json.dumps(
        {"data": {"unresolveReviewThread": {"thread": {"id": "PRRT_real", "isResolved": False}}}}
    )

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["gh", "api", "graphql"]:
            joined = " ".join(cmd)
            assert "threadId=PRRT_real" in joined
            assert "unresolveReviewThread" in joined
            return subprocess.CompletedProcess(cmd, 0, stdout=unresolve_payload, stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(real_issue_gateway.subprocess, "run", fake_run)

    runner = CliRunner()
    result = runner.invoke(cli_group, ["unresolve-thread", "PRRT_real"])

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["thread_id"] == "PRRT_real"
    assert output["was_already_unresolved"] is False


# -- add-review-thread-reply --


def test_add_review_thread_reply_calls_gateway(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(
        cli_group,
        ["add-review-thread-reply", "PRRT_abc", "Fixed in commit def5678."],
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
        "_Addressed via twerk-pr-address at 2026-04-10T12:00:00Z_\n"
        "<!-- twerk:pr-address-resolved -->"
    )

    exit_code, output = _invoke(
        cli_group,
        ["add-review-thread-reply", "PRRT_abc", body],
        fake,
    )

    assert exit_code == 0
    assert fake._thread_replies == [("PRRT_abc", body)]
    # The full body (newlines, marker, italics) must survive the round-trip.
    assert output["comment"]["body"] == body


def test_add_review_thread_reply_falls_back_to_real_gateway(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reply_payload = json.dumps(
        {
            "data": {
                "addPullRequestReviewThreadReply": {
                    "comment": {
                        "databaseId": 9001,
                        "body": "Fixed in commit abc1234.",
                        "author": {"login": "schrockn"},
                        "path": "src/foo.py",
                        "line": 42,
                        "createdAt": "2026-04-10T12:00:00Z",
                    }
                }
            }
        }
    )

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["gh", "api", "graphql"]:
            joined = " ".join(cmd)
            assert "threadId=PRRT_real" in joined
            assert "addPullRequestReviewThreadReply" in joined
            return subprocess.CompletedProcess(cmd, 0, stdout=reply_payload, stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(real_issue_gateway.subprocess, "run", fake_run)

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["add-review-thread-reply", "PRRT_real", "Fixed in commit abc1234."],
    )

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["comment"]["id"] == 9001
    assert output["comment"]["author"] == "schrockn"
    assert output["comment"]["line"] == 42
    assert output["comment"]["path"] == "src/foo.py"
