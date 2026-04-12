"""Scenario tests for the standalone ``pr-address`` CLI.

Every exec operation is exercised through ``build_cli()`` — the top-level
standalone CLI entry point that users and skills invoke directly.
"""

import json
import subprocess

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh import real_issue_gateway
from twerk_core.gh.testing import FakeIssueGateway
from twerk_core.gh.types import (
    IssueComment,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRSummary,
)
from twerk_pr_address.cli.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _invoke(
    cli_group: ClinkrGroup,
    args: list[str],
    fake: FakeIssueGateway,
) -> tuple[int, dict]:
    runner = CliRunner()
    result = runner.invoke(cli_group, args, obj={"gh_issue_gateway": fake})
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
    result = runner.invoke(cli_group, ["exec", "get-review-comments", "47"])

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
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "json", "get-feedback"],
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
    result = runner.invoke(cli_group, ["exec", "resolve-thread", "PRRT_real"])

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["thread_id"] == "PRRT_real"
    assert output["was_already_resolved"] is False


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
    result = runner.invoke(cli_group, ["exec", "unresolve-thread", "PRRT_real"])

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["thread_id"] == "PRRT_real"
    assert output["was_already_unresolved"] is False


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
        "_Addressed via twerk-pr-address at 2026-04-10T12:00:00Z_\n"
        "<!-- twerk:pr-address-resolved -->"
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
        ["exec", "add-review-thread-reply", "PRRT_real", "Fixed in commit abc1234."],
    )

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["comment"]["id"] == 9001
    assert output["comment"]["author"] == "schrockn"
    assert output["comment"]["line"] == 42
    assert output["comment"]["path"] == "src/foo.py"


def _make_reply_payload() -> str:
    return json.dumps(
        {
            "data": {
                "addPullRequestReviewThreadReply": {
                    "comment": {
                        "databaseId": 9001,
                        "body": "",
                        "author": {"login": "schrockn"},
                        "path": "src/foo.py",
                        "line": 42,
                        "createdAt": "2026-04-10T12:00:00Z",
                    }
                }
            }
        }
    )


def test_real_gateway_uses_raw_string_flag_for_body(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The body field must be passed via `-f` (raw string), not `-F` (typed).

    `gh api graphql -F body=...` treats the value as a typed field, which is
    the wrong semantics for a free-form markdown string. `-f` tells gh to
    treat it as a literal string. See plan notes for details.
    """
    captured_cmds: list[list[str]] = []

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        captured_cmds.append(list(cmd))
        if cmd[:3] == ["gh", "api", "graphql"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=_make_reply_payload(), stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(real_issue_gateway.subprocess, "run", fake_run)

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "add-review-thread-reply", "PRRT_real", "Fixed in commit abc1234."],
    )
    assert result.exit_code == 0, result.output

    assert len(captured_cmds) == 1
    cmd = captured_cmds[0]
    body_idx = next(
        i for i, arg in enumerate(cmd) if isinstance(arg, str) and arg.startswith("body=")
    )
    assert cmd[body_idx - 1] == "-f", (
        f"body must be passed with -f (raw string), got {cmd[body_idx - 1]!r}"
    )


def test_real_gateway_preserves_body_newlines_through_subprocess(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression guard: the body string passed to subprocess must contain
    real newlines, not literal backslash-n sequences.

    This test passes against current master — the mangling bug happens at
    shell-quoting time outside the Python CLI. Kept as a regression guard
    against any future change that would introduce escaping.
    """
    captured_cmds: list[list[str]] = []

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        captured_cmds.append(list(cmd))
        if cmd[:3] == ["gh", "api", "graphql"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=_make_reply_payload(), stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(real_issue_gateway.subprocess, "run", fake_run)

    body = (
        "Fixed in commit abc1234: use LBYL.\n"
        "\n"
        "Addressed via _twerk-pr-address_ at 2026-04-10T12:00:00Z\n"
        "<!-- twerk:pr-address-resolved -->"
    )
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "add-review-thread-reply", "PRRT_real", body],
    )
    assert result.exit_code == 0, result.output

    cmd = captured_cmds[0]
    body_arg = next(arg for arg in cmd if isinstance(arg, str) and arg.startswith("body="))
    assert body_arg == f"body={body}"
    # Real newlines, not literal backslash-n.
    assert "\n" in body_arg
    assert "\\n" not in body_arg


def test_add_review_thread_reply_reads_body_from_stdin_sentinel(
    cli_group: ClinkrGroup,
) -> None:
    """A `-` positional body argument means 'read the body from stdin'.

    This is the mechanism the twerk-pr-address skill uses with a shell
    heredoc to reliably pass multi-line bodies without escape-sequence
    quoting issues.
    """
    fake = FakeIssueGateway()
    body = (
        "Fixed in commit abc1234: use LBYL.\n"
        "\n"
        "Addressed via _twerk-pr-address_ at 2026-04-10T12:00:00Z\n"
        "<!-- twerk:pr-address-resolved -->"
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "add-review-thread-reply", "PRRT_abc", "-"],
        obj={"gh_issue_gateway": fake},
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


def test_get_pr_for_branch_no_pr_returns_not_found(cli_group: ClinkrGroup) -> None:
    fake = FakeIssueGateway()

    exit_code, output = _invoke(cli_group, ["exec", "get-pr-for-branch", "no-pr"], fake)

    assert exit_code == 0
    assert output["found"] is False
    assert output["error"] == "no PR found"
    assert output["returncode"] == 1


def test_get_pr_for_branch_falls_back_to_real_gateway(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Walks the DI fallback to RealIssueGateway with subprocess stubbed."""
    pr_view_output = json.dumps(
        {
            "number": 47,
            "title": "Port pr-address skill",
            "url": "https://github.com/dagster-io/twerk/pull/47",
            "headRefName": "twerk-pr-address-skill",
            "baseRefName": "master",
        }
    )

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["gh", "pr", "view"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=pr_view_output, stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(real_issue_gateway.subprocess, "run", fake_run)

    runner = CliRunner()
    result = runner.invoke(cli_group, ["exec", "get-pr-for-branch", "twerk-pr-address-skill"])

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["found"] is True
    assert output["number"] == 47
    assert output["title"] == "Port pr-address skill"
    assert output["base_ref_name"] == "master"


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


def test_get_reviews_falls_back_to_real_gateway(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Walks the DI fallback to RealIssueGateway with subprocess stubbed.

    get_reviews uses the REST API (repos/{owner}/{repo}/pulls/{number}/reviews),
    so we stub both the owner/repo lookup and the reviews endpoint.
    """
    owner_repo_output = json.dumps({"owner": {"login": "dagster-io"}, "name": "twerk"})
    reviews_payload = json.dumps(
        [
            {
                "node_id": "PRR_real",
                "user": {"login": "reviewer"},
                "body": "Please fix",
                "state": "CHANGES_REQUESTED",
                "submitted_at": "2026-04-10T12:00:00Z",
            }
        ]
    )

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["gh", "repo", "view"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=owner_repo_output, stderr="")
        if cmd[:2] == ["gh", "api"] and "reviews" in cmd[2]:
            return subprocess.CompletedProcess(cmd, 0, stdout=reviews_payload, stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(real_issue_gateway.subprocess, "run", fake_run)

    runner = CliRunner()
    result = runner.invoke(cli_group, ["exec", "get-reviews", "47"])

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["count"] == 1
    assert output["reviews"][0]["id"] == "PRR_real"
    assert output["reviews"][0]["author"] == "reviewer"


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
    body = "Addressed all review feedback.\n\n_Addressed via pr-address at 2026-04-12T12:00:00Z_"

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "add-issue-comment", "42", "-"],
        obj={"gh_issue_gateway": fake},
        input=body,
    )

    assert result.exit_code == 0, result.output
    assert fake._comments == [(42, body)]
    output = json.loads(result.output)
    assert output["comment"]["body"] == body


def test_add_issue_comment_falls_back_to_real_gateway(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner_repo_output = json.dumps({"owner": {"login": "dagster-io"}, "name": "twerk"})
    comment_payload = json.dumps(
        {
            "id": 9001,
            "body": "Addressed in latest commit.",
            "user": {"login": "schrockn"},
            "html_url": "https://github.com/dagster-io/twerk/pull/47#issuecomment-9001",
        }
    )

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["gh", "repo", "view"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=owner_repo_output, stderr="")
        if cmd[:2] == ["gh", "api"] and "--method" in cmd and "POST" in cmd:
            return subprocess.CompletedProcess(cmd, 0, stdout=comment_payload, stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(real_issue_gateway.subprocess, "run", fake_run)

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "add-issue-comment", "47", "Addressed in latest commit."],
    )

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["comment"]["id"] == 9001
    assert output["comment"]["author"] == "schrockn"


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


def test_add_reaction_falls_back_to_real_gateway(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner_repo_output = json.dumps({"owner": {"login": "dagster-io"}, "name": "twerk"})
    reaction_payload = json.dumps(
        {
            "id": 5001,
            "content": "+1",
        }
    )

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["gh", "repo", "view"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=owner_repo_output, stderr="")
        if cmd[:2] == ["gh", "api"] and "--method" in cmd and "POST" in cmd:
            return subprocess.CompletedProcess(cmd, 0, stdout=reaction_payload, stderr="")
        raise AssertionError(f"unexpected subprocess.run call: {cmd!r}")

    monkeypatch.setattr(real_issue_gateway.subprocess, "run", fake_run)

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "add-reaction", "9001", "+1"],
    )

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["id"] == 5001
    assert output["comment_id"] == 9001
    assert output["content"] == "+1"


# -- JSON-wrapper mode parity --


def _invoke_json(
    cli_group: ClinkrGroup,
    op: str,
    payload: dict,
    fake: FakeIssueGateway,
) -> tuple[int, dict]:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "json", op],
        input=json.dumps(payload),
        obj={"gh_issue_gateway": fake},
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
    )
    fake = FakeIssueGateway(prs_by_branch={"feature": pr})

    exit_code, output = _invoke_json(cli_group, "get-pr-for-branch", {"branch": "feature"}, fake)

    assert exit_code == 0
    assert output["success"] is True
    assert output["found"] is True
    assert output["number"] == 42


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
