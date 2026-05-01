from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.testing import FakeIssueGateway
from twerk_core.gh.types import IssueComment, PRChangedFile
from twerk_reviewer.cli.main import build_cli
from twerk_reviewer.context import ReviewerCliContext
from twerk_reviewer.gateways.harness_detection.fake import FakeHarnessDetectionGateway
from twerk_reviewer.gateways.local_diff.fake import FakeLocalDiffGateway
from twerk_reviewer.gateways.review_definition.fake import FakeReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.fake import FakeReviewExecutionGateway


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


_BOT = "github-actions[bot]"


def _context_with_issue_gateway(gateway: FakeIssueGateway) -> ClinkrContextObject:
    ctx = ReviewerCliContext(
        review_definition=FakeReviewDefinitionGateway(),
        local_diff=FakeLocalDiffGateway(),
        review_execution=FakeReviewExecutionGateway(),
        harness_detection=FakeHarnessDetectionGateway(),
        issue_gateway=gateway,
        cwd=Path("/anywhere"),
    )
    return build_clinkr_context_object(lambda: ctx)


def test_exec_group_is_hidden_from_reviewer_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    # review/harness are visible, exec should not be.
    assert "review" in result.output
    assert "harness" in result.output
    assert "exec" not in result.output


def test_exec_help_lists_format_findings_comment(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["exec", "-h"])

    assert result.exit_code == 0
    assert "format-findings-comment" in result.output


def test_format_findings_comment_renders_findings_from_stdin(
    cli_group: ClinkrGroup,
) -> None:
    payload = {
        "exit_code": 0,
        "data": {
            "review_name": "dignified-python",
            "base_ref": "master",
            "format": "findings",
            "count": 1,
            "findings": [
                {
                    "path": "app.py",
                    "line": 42,
                    "severity": "warning",
                    "summary": "Avoid print",
                    "details": "Use click.echo() instead.",
                }
            ],
        },
    }

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "format-findings-comment"],
        input=json.dumps(payload),
    )

    assert result.exit_code == 0, result.output
    assert result.output.startswith("<!-- twerk-reviewer:dignified-python -->\n")
    assert "## twerk-reviewer · `dignified-python`" in result.output
    assert "| Severity | File | Line | Summary |" in result.output
    assert "| ⚠️ warning | `app.py` | 42 | Avoid print |" in result.output
    assert "### `app.py:42` — warning" in result.output
    assert "_Post-only steelthread: this comment never blocks the check._" in result.output


def test_format_findings_comment_renders_empty_findings(cli_group: ClinkrGroup) -> None:
    payload = {
        "exit_code": 0,
        "data": {
            "review_name": "dignified-python",
            "base_ref": "master",
            "format": "findings",
            "count": 0,
            "findings": [],
        },
    }

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "format-findings-comment"],
        input=json.dumps(payload),
    )

    assert result.exit_code == 0, result.output
    assert "**No findings** against base `master`. ✅" in result.output
    assert "| Severity |" not in result.output


def test_format_findings_comment_renders_error_payload(cli_group: ClinkrGroup) -> None:
    payload = {
        "exit_code": 2,
        "error_type": "harness_binary_missing",
        "message": "claude not on PATH",
    }

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "format-findings-comment"],
        input=json.dumps(payload),
    )

    assert result.exit_code == 0, result.output
    assert "**Reviewer failed**" in result.output
    assert "- **Error type:** `harness_binary_missing`" in result.output
    assert "- **Message:** claude not on PATH" in result.output
    assert "Post-only steelthread" not in result.output


def test_format_findings_comment_fails_on_malformed_stdin(
    cli_group: ClinkrGroup,
) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "format-findings-comment"],
        input="not json at all",
    )

    assert result.exit_code == 1
    assert "format-findings-comment" in result.output
    assert "valid JSON" in result.output


# -- post-findings-comment --


def _make_bot_comment(comment_id: int, *, body: str) -> IssueComment:
    return IssueComment(
        id=comment_id,
        body=body,
        author=_BOT,
        url=f"https://github.com/org/repo/pull/47#issuecomment-{comment_id}",
    )


def test_exec_help_lists_post_findings_comment(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["exec", "-h"])
    assert result.exit_code == 0
    assert "post-findings-comment" in result.output


def test_exec_help_lists_classify_inline_findings(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["exec", "-h"])
    assert result.exit_code == 0
    assert "classify-inline-findings" in result.output


def test_classify_inline_findings_groups_findings_by_commentability(
    cli_group: ClinkrGroup,
) -> None:
    payload = {
        "exit_code": 0,
        "data": {
            "review_name": "dignified-python",
            "base_ref": "master",
            "format": "findings",
            "count": 2,
            "findings": [
                {
                    "path": "app.py",
                    "line": 1,
                    "severity": "warning",
                    "summary": "Inline this",
                    "details": "This line is in the PR diff.",
                },
                {
                    "path": "app.py",
                    "line": None,
                    "severity": "info",
                    "summary": "Fallback this",
                    "details": "No concrete line was provided.",
                },
            ],
        },
    }
    fake = FakeIssueGateway(
        pr_changed_files={
            47: [PRChangedFile(path="app.py", status="modified", patch="@@ -1 +1 @@\n+new")]
        }
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "classify-inline-findings", "--pr-number", "47"],
        input=json.dumps(payload),
        obj=_context_with_issue_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["inlineable"] == [
        {
            "finding": {
                "path": "app.py",
                "line": 1,
                "severity": "warning",
                "summary": "Inline this",
                "details": "This line is in the PR diff.",
            },
            "target": {"path": "app.py", "line": 1},
        }
    ]
    assert data["fallback_only"][0]["reason"] == "missing_line"


def test_post_findings_comment_creates_comment_when_none_exists(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()
    body = "<!-- twerk-reviewer:dignified-python -->\n## twerk-reviewer · `dignified-python`\n"

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-findings-comment", "--pr-number", "47"],
        input=body,
        obj=_context_with_issue_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    assert len(fake._comments) == 1
    assert fake._comments[0][0] == 47
    posted_body = fake._comments[0][1]
    assert posted_body.startswith("<!-- twerk-reviewer:dignified-python -->\n")
    assert "### Activity Log" in posted_body
    assert fake._updated_comments == []


def test_post_findings_comment_updates_existing_bot_comment(
    cli_group: ClinkrGroup,
) -> None:
    existing_body = (
        "<!-- twerk-reviewer:dignified-python -->\n"
        "## twerk-reviewer · `dignified-python`\n"
        "\n"
        "### Activity Log\n"
        "\n"
        "- 2026-04-22T12:00:00Z\n"
    )
    fake = FakeIssueGateway(
        discussion_comments={47: [_make_bot_comment(101, body=existing_body)]},
    )
    new_body = "<!-- twerk-reviewer:dignified-python -->\nfresh findings\n"

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-findings-comment", "--pr-number", "47"],
        input=new_body,
        obj=_context_with_issue_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    assert fake._comments == []
    assert len(fake._updated_comments) == 1
    comment_id, written = fake._updated_comments[0]
    assert comment_id == 101
    # The new body replaced the findings content…
    assert "fresh findings" in written
    # …and the prior Activity Log entry was preserved, plus a new one appended.
    assert "2026-04-22T12:00:00Z" in written
    assert written.count("- ") >= 2


def test_post_findings_comment_ignores_human_marker_capture(
    cli_group: ClinkrGroup,
) -> None:
    """A human dropping the marker into their own comment cannot hijack the bot slot."""
    human_body = "<!-- twerk-reviewer:dignified-python -->\npretend i'm the bot\n"
    fake = FakeIssueGateway(
        discussion_comments={
            47: [
                IssueComment(
                    id=999,
                    body=human_body,
                    author="alice",
                    url="https://github.com/org/repo/pull/47#issuecomment-999",
                )
            ]
        },
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-findings-comment", "--pr-number", "47"],
        input="<!-- twerk-reviewer:dignified-python -->\nreal findings\n",
        obj=_context_with_issue_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    # Human comment was not PATCHed.
    assert fake._updated_comments == []
    # And a fresh bot comment was posted.
    assert len(fake._comments) == 1


def test_post_findings_comment_rejects_body_missing_marker(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakeIssueGateway()
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-findings-comment", "--pr-number", "47"],
        input="no marker here\nsecond line\n",
        obj=_context_with_issue_gateway(fake),
    )

    assert result.exit_code == 1
    assert "marker" in result.output
    assert fake._comments == []
    assert fake._updated_comments == []


def test_post_findings_comment_caps_activity_log_at_ten_entries(
    cli_group: ClinkrGroup,
) -> None:
    # Use a distinct month so the new entry (recorded at "now") is easy to tell
    # apart from the carried-forward ones.
    prior_entries = "\n".join(f"- 2026-01-{i:02d}T12:00:00Z" for i in range(1, 11))
    existing_body = (
        f"<!-- twerk-reviewer:dignified-python -->\nbody\n\n### Activity Log\n\n{prior_entries}\n"
    )
    fake = FakeIssueGateway(
        discussion_comments={47: [_make_bot_comment(42, body=existing_body)]},
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-findings-comment", "--pr-number", "47"],
        input="<!-- twerk-reviewer:dignified-python -->\nnew\n",
        obj=_context_with_issue_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    _, written = fake._updated_comments[0]
    # Cap of 10: nine of the prior January entries should survive (oldest dropped)
    # alongside one new entry added this run.
    assert written.count("- 2026-01-") == 9
    assert "2026-01-01T12:00:00Z" not in written
    assert "2026-01-10T12:00:00Z" in written
