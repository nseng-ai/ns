from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from roaster.cli.main import build_cli
from roaster.context import RoasterCliContext
from roaster.gateways.local_diff.fake import FakeLocalDiffGateway
from roaster.gateways.review_catalog.fake import FakeReviewCatalogGateway
from roaster.harness.fake import FakeHarnessRuntime


def _context(
    *,
    paths_by_binary: dict[str, str] | None = None,
) -> ClinkrContextObject:
    ctx = RoasterCliContext(
        catalog=FakeReviewCatalogGateway(),
        diff=FakeLocalDiffGateway(),
        harness_runtime=FakeHarnessRuntime(paths_by_binary=paths_by_binary),
        pr_gateway=FakePRGateway(),
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


def test_harness_show_validates_explicit_harness_name(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()

    result = runner.invoke(
        cli_group,
        ["harness", "show", "claude-code"],
        obj=_context(paths_by_binary={}),
    )

    assert result.exit_code == 0, result.output
    assert "Harness: claude-code" in result.output


def test_harness_show_rejects_unknown_explicit_harness_name(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()

    result = runner.invoke(
        cli_group,
        ["harness", "show", "banana"],
        obj=_context(paths_by_binary={}),
    )

    assert result.exit_code != 0
    assert "Unknown harness 'banana'" in result.output


def test_harness_show_surfaces_no_harness_detected(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()

    result = runner.invoke(cli_group, ["harness", "show"], obj=_context())

    assert result.exit_code != 0
    assert "No harness detected" in result.output
