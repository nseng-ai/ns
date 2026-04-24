from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.testing import FakeCheckRunsGateway, FakeIssueGateway
from twerk_core.gh.types import IssueComment
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


def _context(
    *,
    issue_gateway: FakeIssueGateway | None = None,
    check_runs: FakeCheckRunsGateway | None = None,
) -> ClinkrContextObject:
    ctx = ReviewerCliContext(
        review_definition=FakeReviewDefinitionGateway(),
        local_diff=FakeLocalDiffGateway(),
        review_execution=FakeReviewExecutionGateway(),
        harness_detection=FakeHarnessDetectionGateway(),
        issue_gateway=issue_gateway or FakeIssueGateway(),
        check_runs=check_runs or FakeCheckRunsGateway(),
        cwd=Path("/anywhere"),
    )
    return build_clinkr_context_object(lambda: ctx)


def _context_with_issue_gateway(gateway: FakeIssueGateway) -> ClinkrContextObject:
    return _context(issue_gateway=gateway)


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


# -- post-findings-check --


def _findings_envelope(
    *,
    review_name: str = "dignified-python",
    base_ref: str = "master",
    findings: list[dict[str, object]] | None = None,
) -> str:
    findings = findings or []
    return json.dumps(
        {
            "exit_code": 0,
            "data": {
                "review_name": review_name,
                "base_ref": base_ref,
                "format": "findings",
                "count": len(findings),
                "findings": findings,
            },
        }
    )


def test_exec_help_lists_post_findings_check(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["exec", "-h"])
    assert result.exit_code == 0
    assert "post-findings-check" in result.output


def test_post_findings_check_creates_check_run_with_line_annotations(
    cli_group: ClinkrGroup,
) -> None:
    check_runs = FakeCheckRunsGateway()
    envelope = _findings_envelope(
        findings=[
            {
                "path": "app.py",
                "line": 42,
                "severity": "warning",
                "summary": "Avoid print",
                "details": "Use click.echo() instead.",
            },
            {
                "path": "app.py",
                "line": 99,
                "severity": "error",
                "summary": "Fix import",
                "details": "Unused import breaks lint.",
            },
        ]
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "exec",
            "post-findings-check",
            "--head-sha",
            "abc123",
            "--review-key",
            "dignified-python",
        ],
        input=envelope,
        obj=_context(check_runs=check_runs),
    )

    assert result.exit_code == 0, result.output
    run = check_runs.find_check_run("abc123", "twerk-reviewer/dignified-python")
    assert run is not None
    annotations = check_runs.list_annotations(run.id)
    assert len(annotations) == 2
    assert annotations[0].start_line == 42
    assert annotations[0].annotation_level == "warning"
    assert annotations[0].title == "Avoid print"
    assert annotations[1].annotation_level == "failure"  # "error" → "failure"


def test_post_findings_check_is_idempotent_across_reruns(
    cli_group: ClinkrGroup,
) -> None:
    """Re-running against the same (head_sha, review_key) replaces — does not duplicate."""
    check_runs = FakeCheckRunsGateway()
    envelope = _findings_envelope(
        findings=[
            {
                "path": "app.py",
                "line": 1,
                "severity": "warning",
                "summary": "s",
                "details": "d",
            }
        ]
    )
    runner = CliRunner()

    for _ in range(2):
        result = runner.invoke(
            cli_group,
            [
                "exec",
                "post-findings-check",
                "--head-sha",
                "abc",
                "--review-key",
                "r",
            ],
            input=envelope,
            obj=_context(check_runs=check_runs),
        )
        assert result.exit_code == 0, result.output

    # Two upsert calls, same (head_sha, name) — only one check run stored.
    assert len(check_runs._upserted_calls) == 2
    assert check_runs.find_check_run("abc", "twerk-reviewer/r") is not None
    # Distinct SHA would create a separate run; same SHA should not.
    all_runs = [v for k, v in check_runs._check_runs.items() if k == ("abc", "twerk-reviewer/r")]
    assert len(all_runs) == 1


def test_post_findings_check_renders_file_level_findings_in_output_text(
    cli_group: ClinkrGroup,
) -> None:
    """Findings with line=None are not dropped — they appear in output.text."""
    check_runs = FakeCheckRunsGateway()
    envelope = _findings_envelope(
        findings=[
            {
                "path": "docs/README.md",
                "line": None,
                "severity": "info",
                "summary": "File-level observation",
                "details": "Consider rewriting.",
            },
            {
                "path": "app.py",
                "line": 5,
                "severity": "warning",
                "summary": "Line-level finding",
                "details": "Use x instead of y.",
            },
        ]
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "exec",
            "post-findings-check",
            "--head-sha",
            "abc",
            "--review-key",
            "r",
        ],
        input=envelope,
        obj=_context(check_runs=check_runs),
    )

    assert result.exit_code == 0, result.output
    run = check_runs.find_check_run("abc", "twerk-reviewer/r")
    assert run is not None
    annotations = check_runs.list_annotations(run.id)
    # Only the line-bearing finding becomes an annotation.
    assert len(annotations) == 1
    assert annotations[0].start_line == 5

    # The file-level finding lives in output.text — never dropped.
    output = check_runs._upserted_outputs[-1]
    assert output.text is not None
    assert "docs/README.md" in output.text
    assert "File-level observation" in output.text


def test_post_findings_check_handles_error_envelope(
    cli_group: ClinkrGroup,
) -> None:
    """A non-zero exit_code envelope still produces a check run — just with no annotations."""
    check_runs = FakeCheckRunsGateway()
    envelope = json.dumps(
        {
            "exit_code": 2,
            "error_type": "harness_binary_missing",
            "message": "claude not on PATH",
        }
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "exec",
            "post-findings-check",
            "--head-sha",
            "abc",
            "--review-key",
            "r",
        ],
        input=envelope,
        obj=_context(check_runs=check_runs),
    )

    assert result.exit_code == 0, result.output
    run = check_runs.find_check_run("abc", "twerk-reviewer/r")
    assert run is not None
    # Zero annotations — there are no findings to anchor.
    assert check_runs.list_annotations(run.id) == ()


def test_post_findings_check_rejects_malformed_stdin(
    cli_group: ClinkrGroup,
) -> None:
    check_runs = FakeCheckRunsGateway()
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "exec",
            "post-findings-check",
            "--head-sha",
            "abc",
            "--review-key",
            "r",
        ],
        input="not json at all",
        obj=_context(check_runs=check_runs),
    )

    assert result.exit_code == 1
    assert "post-findings-check" in result.output
    # No check run was created on parse failure.
    assert check_runs.find_check_run("abc", "twerk-reviewer/r") is None


def test_post_findings_check_run_url_flag_accepted(cli_group: ClinkrGroup) -> None:
    """--run-url is optional and ends up in the summary; exit code 0."""
    check_runs = FakeCheckRunsGateway()
    envelope = _findings_envelope(findings=[])
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "exec",
            "post-findings-check",
            "--head-sha",
            "abc",
            "--review-key",
            "r",
            "--run-url",
            "https://example.com/run/42",
        ],
        input=envelope,
        obj=_context(check_runs=check_runs),
    )
    assert result.exit_code == 0, result.output


def test_post_findings_check_empty_findings_creates_no_annotations(
    cli_group: ClinkrGroup,
) -> None:
    check_runs = FakeCheckRunsGateway()
    envelope = _findings_envelope(findings=[])
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "exec",
            "post-findings-check",
            "--head-sha",
            "abc",
            "--review-key",
            "r",
        ],
        input=envelope,
        obj=_context(check_runs=check_runs),
    )

    assert result.exit_code == 0, result.output
    run = check_runs.find_check_run("abc", "twerk-reviewer/r")
    assert run is not None
    assert check_runs.list_annotations(run.id) == ()
