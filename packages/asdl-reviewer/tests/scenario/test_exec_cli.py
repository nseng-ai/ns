from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import (
    PRChangedFile,
    PRDiscussionComment,
    PRInlineCommentInput,
    PRReview,
    PRReviewComment,
)
from asdl_reviewer.cli.main import build_cli
from asdl_reviewer.context import ReviewerCliContext
from asdl_reviewer.gateways.local_diff.fake import FakeLocalDiffGateway
from asdl_reviewer.gateways.review_catalog.fake import FakeReviewCatalogGateway
from asdl_reviewer.harness.fake import FakeHarnessRuntime


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


_BOT = "github-actions[bot]"


def _context_with_pr_gateway(gateway: FakePRGateway) -> ClinkrContextObject:
    ctx = ReviewerCliContext(
        catalog=FakeReviewCatalogGateway(),
        diff=FakeLocalDiffGateway(),
        harness_runtime=FakeHarnessRuntime(),
        pr_gateway=gateway,
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
    assert result.output.startswith("<!-- asdl-reviewer:dignified-python -->\n")
    assert "## asdl-reviewer · `dignified-python`" in result.output
    assert "| Severity | File | Line | Summary |" in result.output
    assert "| ⚠️ warning | `app.py` | 42 | Avoid print |" in result.output
    assert "### `app.py:42` — warning" in result.output
    assert "_Post-only steelthread: this comment never blocks the check._" in result.output


def test_format_findings_comment_renders_inline_result_file_status(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    payload = _findings_payload(
        [
            {
                "path": "app.py",
                "line": 42,
                "severity": "warning",
                "summary": "Avoid print",
                "details": "Use click.echo() instead.",
            }
        ]
    )
    inline_result_file = tmp_path / "inline-result.json"
    inline_result_file.write_text(
        json.dumps(
            {
                "posted_count": 1,
                "skipped_duplicate_count": 2,
                "fallback_only_count": 3,
                "api_error": "validation failed",
            }
        ),
        encoding="utf-8",
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "format-findings-comment", "--inline-result-file", str(inline_result_file)],
        input=json.dumps(payload),
    )

    assert result.exit_code == 0, result.output
    assert "### Inline posting" in result.output
    assert "- **Inline comments posted:** 1" in result.output
    assert "- **Duplicate inline comments skipped:** 2" in result.output
    assert "- **Summary-only findings:** 3" in result.output
    assert "- **API error:** validation failed" in result.output
    assert "| ⚠️ warning | `app.py` | 42 | Avoid print |" in result.output


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


def _make_bot_comment(comment_id: int, *, body: str) -> PRDiscussionComment:
    return PRDiscussionComment(
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


def test_exec_help_lists_post_inline_findings(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["exec", "-h"])
    assert result.exit_code == 0
    assert "post-inline-findings" in result.output


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
    fake = FakePRGateway(
        pr_changed_files={
            47: [PRChangedFile(path="app.py", status="modified", patch="@@ -1 +1 @@\n+new")]
        }
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "classify-inline-findings", "--pr-number", "47"],
        input=json.dumps(payload),
        obj=_context_with_pr_gateway(fake),
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


def _findings_payload(findings: list[dict[str, object]]) -> dict[str, object]:
    return {
        "exit_code": 0,
        "data": {
            "review_name": "dignified-python",
            "base_ref": "master",
            "format": "findings",
            "count": len(findings),
            "findings": findings,
        },
    }


class _RejectingCreateReviewGateway(FakePRGateway):
    def create_pr_review(
        self, pr_number: int, comments: tuple[PRInlineCommentInput, ...]
    ) -> PRReview:
        raise RuntimeError("validation failed")


def test_post_inline_findings_posts_inlineable_findings_in_batched_review(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway(
        pr_changed_files={
            47: [PRChangedFile(path="app.py", status="modified", patch="@@ -1 +1 @@\n+new")]
        }
    )
    payload = _findings_payload(
        [
            {
                "path": "app.py",
                "line": 1,
                "severity": "warning",
                "summary": "Inline this",
                "details": "This line is in the PR diff.",
            }
        ]
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-inline-findings", "--pr-number", "47"],
        input=json.dumps(payload),
        obj=_context_with_pr_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["posted_count"] == 1
    assert data["skipped_duplicate_count"] == 0
    assert data["fallback_only_count"] == 0
    assert len(fake.created_reviews) == 1
    pr_number, comments = fake.created_reviews[0]
    assert pr_number == 47
    assert len(comments) == 1
    assert comments[0].path == "app.py"
    assert comments[0].line == 1
    assert "<!-- asdl-reviewer-inline:dignified-python:" in comments[0].body
    assert "Inline this" in comments[0].body


def test_post_inline_findings_skips_existing_marker_duplicates(
    cli_group: ClinkrGroup,
) -> None:
    finding = {
        "path": "app.py",
        "line": 1,
        "severity": "warning",
        "summary": "Inline this",
        "details": "This line is in the PR diff.",
    }
    first_fake = FakePRGateway(
        pr_changed_files={
            47: [PRChangedFile(path="app.py", status="modified", patch="@@ -1 +1 @@\n+new")]
        }
    )
    runner = CliRunner()
    first = runner.invoke(
        cli_group,
        ["exec", "post-inline-findings", "--pr-number", "47"],
        input=json.dumps(_findings_payload([finding])),
        obj=_context_with_pr_gateway(first_fake),
    )
    assert first.exit_code == 0, first.output
    marker_body = first_fake.created_reviews[0][1][0].body

    fake = FakePRGateway(
        pr_changed_files={
            47: [PRChangedFile(path="app.py", status="modified", patch="@@ -1 +1 @@\n+new")]
        },
        pr_review_comments={
            47: [
                PRReviewComment(
                    id=10,
                    body=marker_body,
                    author=_BOT,
                    path="app.py",
                    line=1,
                    created_at="2026-04-30T00:00:00Z",
                )
            ]
        },
    )

    result = runner.invoke(
        cli_group,
        ["exec", "post-inline-findings", "--pr-number", "47"],
        input=json.dumps(_findings_payload([finding])),
        obj=_context_with_pr_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["posted_count"] == 0
    assert data["skipped_duplicate_count"] == 1
    assert fake.created_reviews == ()


def test_post_inline_findings_reports_fallback_only_findings(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway(
        pr_changed_files={
            47: [PRChangedFile(path="app.py", status="modified", patch="@@ -1 +1 @@\n+new")]
        }
    )
    payload = _findings_payload(
        [
            {
                "path": "app.py",
                "line": None,
                "severity": "info",
                "summary": "Fallback this",
                "details": "No concrete line was provided.",
            },
            {
                "path": "other.py",
                "line": 10,
                "severity": "warning",
                "summary": "Not changed",
                "details": "File is not in the PR diff.",
            },
        ]
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-inline-findings", "--pr-number", "47"],
        input=json.dumps(payload),
        obj=_context_with_pr_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["posted_count"] == 0
    assert data["fallback_only_count"] == 2
    assert [item["reason"] for item in data["fallback_only"]] == [
        "missing_line",
        "file_not_changed",
    ]
    assert fake.created_reviews == ()


def test_post_inline_findings_handles_empty_findings_as_noop(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-inline-findings", "--pr-number", "47"],
        input=json.dumps(_findings_payload([])),
        obj=_context_with_pr_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["posted_count"] == 0
    assert data["fallback_only_count"] == 0
    assert fake.created_reviews == ()


def test_post_inline_findings_reports_api_rejection_without_losing_fallback_accounting(
    cli_group: ClinkrGroup,
) -> None:
    fake = _RejectingCreateReviewGateway(
        pr_changed_files={
            47: [PRChangedFile(path="app.py", status="modified", patch="@@ -1 +1 @@\n+new")]
        }
    )
    payload = _findings_payload(
        [
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
        ]
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-inline-findings", "--pr-number", "47"],
        input=json.dumps(payload),
        obj=_context_with_pr_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["posted_count"] == 0
    assert data["fallback_only_count"] == 1
    assert data["fallback_only"][0]["reason"] == "missing_line"
    assert data["api_error"] == "validation failed"


# -- post-findings-comment --


def test_post_findings_comment_creates_comment_when_none_exists(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    body = "<!-- asdl-reviewer:dignified-python -->\n## asdl-reviewer · `dignified-python`\n"

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-findings-comment", "--pr-number", "47"],
        input=body,
        obj=_context_with_pr_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    assert len(fake.comments) == 1
    assert fake.comments[0][0] == 47
    posted_body = fake.comments[0][1]
    assert posted_body.startswith("<!-- asdl-reviewer:dignified-python -->\n")
    assert "### Activity Log" in posted_body
    assert fake.updated_comments == ()


def test_post_findings_comment_updates_existing_bot_comment(
    cli_group: ClinkrGroup,
) -> None:
    existing_body = (
        "<!-- asdl-reviewer:dignified-python -->\n"
        "## asdl-reviewer · `dignified-python`\n"
        "\n"
        "### Activity Log\n"
        "\n"
        "- 2026-04-22T12:00:00Z\n"
    )
    fake = FakePRGateway(
        discussion_comments={47: [_make_bot_comment(101, body=existing_body)]},
    )
    new_body = "<!-- asdl-reviewer:dignified-python -->\nfresh findings\n"

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-findings-comment", "--pr-number", "47"],
        input=new_body,
        obj=_context_with_pr_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    assert fake.comments == ()
    assert len(fake.updated_comments) == 1
    comment_id, written = fake.updated_comments[0]
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
    human_body = "<!-- asdl-reviewer:dignified-python -->\npretend i'm the bot\n"
    fake = FakePRGateway(
        discussion_comments={
            47: [
                PRDiscussionComment(
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
        input="<!-- asdl-reviewer:dignified-python -->\nreal findings\n",
        obj=_context_with_pr_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    # Human comment was not PATCHed.
    assert fake.updated_comments == ()
    # And a fresh bot comment was posted.
    assert len(fake.comments) == 1


def test_post_findings_comment_rejects_body_missing_marker(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-findings-comment", "--pr-number", "47"],
        input="no marker here\nsecond line\n",
        obj=_context_with_pr_gateway(fake),
    )

    assert result.exit_code == 1
    assert "marker" in result.output
    assert fake.comments == ()
    assert fake.updated_comments == ()


def test_post_findings_comment_caps_activity_log_at_ten_entries(
    cli_group: ClinkrGroup,
) -> None:
    # Use a distinct month so the new entry (recorded at "now") is easy to tell
    # apart from the carried-forward ones.
    prior_entries = "\n".join(f"- 2026-01-{i:02d}T12:00:00Z" for i in range(1, 11))
    existing_body = (
        f"<!-- asdl-reviewer:dignified-python -->\nbody\n\n### Activity Log\n\n{prior_entries}\n"
    )
    fake = FakePRGateway(
        discussion_comments={47: [_make_bot_comment(42, body=existing_body)]},
    )

    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "post-findings-comment", "--pr-number", "47"],
        input="<!-- asdl-reviewer:dignified-python -->\nnew\n",
        obj=_context_with_pr_gateway(fake),
    )

    assert result.exit_code == 0, result.output
    _, written = fake.updated_comments[0]
    # Cap of 10: nine of the prior January entries should survive (oldest dropped)
    # alongside one new entry added this run.
    assert written.count("- 2026-01-") == 9
    assert "2026-01-01T12:00:00Z" not in written
    assert "2026-01-10T12:00:00Z" in written
