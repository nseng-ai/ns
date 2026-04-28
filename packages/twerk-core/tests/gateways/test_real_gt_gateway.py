from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from twerk_core.gt.real_gateway import RealGtGateway, parse_stack_output
from twerk_core.gt.types import GtCommandFailure, StackInfo


def test_real_gt_gateway_missing_gt_returns_command_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError("gt: not found")

    monkeypatch.setattr("twerk_core.gt.real_gateway.subprocess.run", fake_run)

    result = RealGtGateway().trunk(Path("/repo"))

    assert isinstance(result, GtCommandFailure)
    assert result.returncode == 127
    assert "gt: not found" in result.message


def test_parse_stack_output_linear_two_branch() -> None:
    stdout = "◯  master (code/twerk)\n◉  add-objective-current-skill\n"

    result = parse_stack_output(stdout)

    assert result == StackInfo(
        trunk="master",
        current="add-objective-current-skill",
        ancestors=("master",),
        children=(),
        warnings=(),
    )


def test_parse_stack_output_linear_three_branch_with_child() -> None:
    stdout = "◯  master\n◯  feat/base\n◉  feat/middle\n◯  feat/child\n"

    result = parse_stack_output(stdout)

    assert result == StackInfo(
        trunk="master",
        current="feat/middle",
        ancestors=("master", "feat/base"),
        children=("feat/child",),
        warnings=(),
        descendants=("feat/child",),
    )


def test_parse_stack_output_descendants_includes_grandchildren() -> None:
    stdout = "◯  master\n◯  feat/base\n◉  feat/middle\n◯  feat/child\n◯  feat/grandchild\n"

    result = parse_stack_output(stdout)

    assert result is not None
    assert result.descendants == ("feat/child", "feat/grandchild")
    assert result.ancestors == ("master", "feat/base")


def test_parse_stack_output_current_is_trunk() -> None:
    stdout = "◉  master (code/twerk)\n"

    result = parse_stack_output(stdout)

    assert result == StackInfo(
        trunk="master",
        current="master",
        ancestors=(),
        children=(),
        warnings=(),
    )


def test_parse_stack_output_warns_on_off_column_entries() -> None:
    # Sibling branch off ancestor sits at a different column.
    stdout = "◯  master\n◯  feat/base\n  ◯  feat/sibling\n◉  feat/current\n"

    result = parse_stack_output(stdout)

    assert result is not None
    assert result.current == "feat/current"
    assert result.ancestors == ("master", "feat/base")
    assert any("outside the current branch's column" in w for w in result.warnings)


def test_parse_stack_output_no_current_marker_returns_none() -> None:
    stdout = "◯  master\n◯  feat/base\n"

    assert parse_stack_output(stdout) is None


def test_real_gt_gateway_stack_passes_log_and_children(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    log_stdout = "◯  master\n◉  feat/current\n"
    children_stdout = ""
    calls: list[list[str]] = []

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(cmd)
        if cmd[1:4] == ["log", "short", "--stack"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=log_stdout, stderr="")
        if cmd[1] == "children":
            return subprocess.CompletedProcess(cmd, 0, stdout=children_stdout, stderr="")
        raise AssertionError(f"unexpected gt invocation: {cmd!r}")

    monkeypatch.setattr("twerk_core.gt.real_gateway.subprocess.run", fake_run)

    result = RealGtGateway().stack(Path("/repo"))

    assert result == StackInfo(
        trunk="master",
        current="feat/current",
        ancestors=("master",),
        children=(),
        warnings=(),
    )
    assert any(c[1:4] == ["log", "short", "--stack"] for c in calls)
    assert any(c[1] == "children" for c in calls)


def test_real_gt_gateway_stack_uses_gt_children_for_authoritative_children(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    log_stdout = "◯  master\n◉  feat/current\n"
    children_stdout = "feat/childA\nfeat/childB\n"

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[1:4] == ["log", "short", "--stack"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=log_stdout, stderr="")
        if cmd[1] == "children":
            return subprocess.CompletedProcess(cmd, 0, stdout=children_stdout, stderr="")
        raise AssertionError(f"unexpected gt invocation: {cmd!r}")

    monkeypatch.setattr("twerk_core.gt.real_gateway.subprocess.run", fake_run)

    result = RealGtGateway().stack(Path("/repo"))

    assert isinstance(result, StackInfo)
    assert result.children == ("feat/childA", "feat/childB")
    # Parser saw zero children but gt children reports two; warning surfaces the diff.
    assert any("differ between gt log parse" in w for w in result.warnings)


def test_real_gt_gateway_stack_plumbs_descendants_through(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    log_stdout = "◯  master\n◉  feat/current\n◯  feat/child\n◯  feat/grandchild\n"
    children_stdout = "feat/child\n"

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[1:4] == ["log", "short", "--stack"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=log_stdout, stderr="")
        if cmd[1] == "children":
            return subprocess.CompletedProcess(cmd, 0, stdout=children_stdout, stderr="")
        raise AssertionError(f"unexpected gt invocation: {cmd!r}")

    monkeypatch.setattr("twerk_core.gt.real_gateway.subprocess.run", fake_run)

    result = RealGtGateway().stack(Path("/repo"))

    assert isinstance(result, StackInfo)
    assert result.children == ("feat/child",)
    assert result.descendants == ("feat/child", "feat/grandchild")


def test_real_gt_gateway_stack_returns_failure_on_log_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="not a gt repo")

    monkeypatch.setattr("twerk_core.gt.real_gateway.subprocess.run", fake_run)

    result = RealGtGateway().stack(Path("/repo"))

    assert isinstance(result, GtCommandFailure)
    assert result.returncode == 1
    assert "not a gt repo" in result.message
