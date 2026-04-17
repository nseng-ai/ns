from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_reviewer import git_toplevel as git_toplevel_module
from twerk_reviewer.cli.main import build_cli
from twerk_reviewer.context import ReviewerCliContext
from twerk_reviewer.gateways.harness_config.fake import FakeHarnessConfigGateway
from twerk_reviewer.gateways.harness_config.gateway import ReviewerConfig
from twerk_reviewer.gateways.harness_detection.fake import FakeHarnessDetectionGateway
from twerk_reviewer.gateways.local_diff.fake import FakeLocalDiffGateway
from twerk_reviewer.gateways.review_definition.fake import FakeReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.fake import FakeReviewExecutionGateway

REPO_ROOT = Path("/repo")


def _context(
    *,
    detection: FakeHarnessDetectionGateway | None = None,
    config: FakeHarnessConfigGateway | None = None,
) -> ReviewerCliContext:
    return ReviewerCliContext(
        review_definition=FakeReviewDefinitionGateway(),
        local_diff=FakeLocalDiffGateway(),
        review_execution=FakeReviewExecutionGateway(),
        harness_detection=detection or FakeHarnessDetectionGateway(),
        harness_config=config or FakeHarnessConfigGateway(),
        cwd=Path("/anywhere"),
    )


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


@pytest.fixture(autouse=True)
def _fake_git_toplevel(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse", "--show-toplevel"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=f"{REPO_ROOT}\n", stderr="")
        raise AssertionError(f"unexpected git command: {cmd!r}")

    monkeypatch.setattr(git_toplevel_module.subprocess, "run", fake_run)


def test_harness_list_human_output_detected(cli_group: ClinkrGroup) -> None:
    detection = FakeHarnessDetectionGateway(paths_by_binary={"claude": "/usr/local/bin/claude"})
    runner = CliRunner()

    result = runner.invoke(cli_group, ["harness", "list"], obj=_context(detection=detection))

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
    detection = FakeHarnessDetectionGateway(paths_by_binary={"claude": "/usr/local/bin/claude"})
    runner = CliRunner()

    result = runner.invoke(
        cli_group,
        ["harness", "json", "list"],
        input="",
        obj=_context(detection=detection),
    )

    assert result.exit_code == 0, result.output
    output = json.loads(result.output)
    assert output["success"] is True
    assert output["count"] == 1
    assert output["harnesses"][0]["name"] == "claude-code"
    assert output["harnesses"][0]["available"] is True


def test_harness_show_reports_persisted_choice(cli_group: ClinkrGroup) -> None:
    config = FakeHarnessConfigGateway()
    config.save(REPO_ROOT, ReviewerConfig(harness_name="claude-code"))
    runner = CliRunner()

    result = runner.invoke(cli_group, ["harness", "show"], obj=_context(config=config))

    assert result.exit_code == 0, result.output
    assert "Harness: claude-code" in result.output


def test_harness_show_surfaces_missing_config(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()

    result = runner.invoke(cli_group, ["harness", "show"], obj=_context())

    assert result.exit_code != 0
    assert "harness init" in result.output


def test_harness_init_persists_selection_with_flag(cli_group: ClinkrGroup) -> None:
    detection = FakeHarnessDetectionGateway(paths_by_binary={"claude": "/usr/local/bin/claude"})
    config = FakeHarnessConfigGateway()
    runner = CliRunner()

    result = runner.invoke(
        cli_group,
        ["harness", "init", "--harness", "claude-code"],
        obj=_context(detection=detection, config=config),
    )

    assert result.exit_code == 0, result.output
    assert config.save_calls[-1] == (REPO_ROOT, ReviewerConfig(harness_name="claude-code"))
    assert "Persisted harness 'claude-code'" in result.output


def test_harness_init_auto_selects_single_available(cli_group: ClinkrGroup) -> None:
    detection = FakeHarnessDetectionGateway(paths_by_binary={"claude": "/usr/local/bin/claude"})
    config = FakeHarnessConfigGateway()
    runner = CliRunner()

    result = runner.invoke(
        cli_group,
        ["harness", "init"],
        obj=_context(detection=detection, config=config),
    )

    assert result.exit_code == 0, result.output
    assert config.save_calls[-1][1].harness_name == "claude-code"
    assert "Selecting the only available harness" in result.output


def test_harness_init_fails_when_no_harness_detected(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    config = FakeHarnessConfigGateway()

    result = runner.invoke(
        cli_group,
        ["harness", "init"],
        obj=_context(config=config),
    )

    assert result.exit_code != 0
    assert "No harnesses detected" in result.output
    assert config.save_calls == ()


def test_harness_init_rejects_unknown_harness(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    config = FakeHarnessConfigGateway()

    result = runner.invoke(
        cli_group,
        ["harness", "init", "--harness", "banana"],
        obj=_context(config=config),
    )

    assert result.exit_code != 0
    assert "Unknown harness" in result.output
    assert config.save_calls == ()


def test_harness_init_not_auto_mounted_as_json_operation(cli_group: ClinkrGroup) -> None:
    """init is a plain click.command, so the json subgroup should not expose it."""
    harness_group = cli_group.commands["harness"]
    assert isinstance(harness_group, ClinkrGroup)
    assert "init" not in harness_group.json_group.commands
