from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.testing import FakeIssueGateway
from asdl_reviewer.cli.main import build_cli
from asdl_reviewer.context import ReviewerCliContext
from asdl_reviewer.gateways.review_environment.fake import FakeReviewEnvironmentGateway


def _context(
    *,
    paths_by_binary: dict[str, str] | None = None,
) -> ClinkrContextObject:
    ctx = ReviewerCliContext(
        review_environment=FakeReviewEnvironmentGateway(
            paths_by_binary=paths_by_binary,
        ),
        issue_gateway=FakeIssueGateway(),
        cwd=Path("/anywhere"),
    )
    return build_clinkr_context_object(lambda: ctx)


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_harness_list_human_output_detected(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()

    result = runner.invoke(
        cli_group,
        ["harness", "list"],
        obj=_context(paths_by_binary={"claude": "/usr/local/bin/claude"}),
    )

    assert result.exit_code == 0, result.output
    assert "claude-code" in result.output
    assert "/usr/local/bin/claude" in result.output


def test_harness_list_human_output_not_detected(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()

    result = runner.invoke(cli_group, ["harness", "list"], obj=_context())

    assert result.exit_code == 0, result.output
    assert "claude-code" in result.output
    assert "not found" in result.output


def test_harness_list_alias_ls(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()

    result = runner.invoke(cli_group, ["harness", "ls"], obj=_context())

    assert result.exit_code == 0, result.output


def test_harness_list_json_output(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()

    result = runner.invoke(
        cli_group,
        ["harness", "list", "--format", "json"],
        obj=_context(paths_by_binary={"claude": "/usr/local/bin/claude"}),
    )

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["count"] == 1
    assert data["harnesses"][0]["name"] == "claude-code"
    assert data["harnesses"][0]["available"] is True


def test_harness_show_reports_single_detected_harness(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()

    result = runner.invoke(
        cli_group,
        ["harness", "show"],
        obj=_context(paths_by_binary={"claude": "/usr/local/bin/claude"}),
    )

    assert result.exit_code == 0, result.output
    assert "Harness: claude-code" in result.output


def test_harness_show_surfaces_no_harness_detected(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()

    result = runner.invoke(cli_group, ["harness", "show"], obj=_context())

    assert result.exit_code != 0
    assert "No harness detected" in result.output
