from __future__ import annotations

import json

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_reviewer.cli.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


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
        "success": True,
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
        "success": True,
        "review_name": "dignified-python",
        "base_ref": "master",
        "format": "findings",
        "count": 0,
        "findings": [],
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
        "success": False,
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
