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
from twerk_reviewer.gateways.harness_detection.fake import FakeHarnessDetectionGateway
from twerk_reviewer.gateways.local_diff.fake import FakeLocalDiffGateway
from twerk_reviewer.gateways.review_definition.fake import FakeReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.fake import FakeReviewExecutionGateway

REPO_ROOT = Path("/repo")


def _context(
    *,
    detection: FakeHarnessDetectionGateway | None = None,
) -> ReviewerCliContext:
    return ReviewerCliContext(
        review_definition=FakeReviewDefinitionGateway(),
        local_diff=FakeLocalDiffGateway(),
        review_execution=FakeReviewExecutionGateway(),
        harness_detection=detection or FakeHarnessDetectionGateway(),
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
    assert output["count"] == 2
    assert output["harnesses"][0]["name"] == "claude-code"
    assert output["harnesses"][0]["available"] is True
    assert output["harnesses"][1]["name"] == "codex"
    assert output["harnesses"][1]["available"] is False


def test_harness_list_reports_codex_when_detected(cli_group: ClinkrGroup) -> None:
    detection = FakeHarnessDetectionGateway(paths_by_binary={"codex": "/usr/local/bin/codex"})
    runner = CliRunner()

    result = runner.invoke(cli_group, ["harness", "list"], obj=_context(detection=detection))

    assert result.exit_code == 0, result.output
    assert "codex" in result.output
    assert "/usr/local/bin/codex" in result.output


def test_harness_show_reports_single_detected_harness(cli_group: ClinkrGroup) -> None:
    detection = FakeHarnessDetectionGateway(paths_by_binary={"claude": "/usr/local/bin/claude"})
    runner = CliRunner()

    result = runner.invoke(cli_group, ["harness", "show"], obj=_context(detection=detection))

    assert result.exit_code == 0, result.output
    assert "Harness: claude-code" in result.output


def test_harness_show_surfaces_no_harness_detected(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()

    result = runner.invoke(cli_group, ["harness", "show"], obj=_context())

    assert result.exit_code != 0
    assert "No harness detected" in result.output
