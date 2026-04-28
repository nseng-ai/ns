from __future__ import annotations

import json
import subprocess
from pathlib import Path

import click
import pytest
from click.testing import CliRunner

from brmem.fake import FakeBranchMemoryGateway
from twerk.cli.plugins import PluginEntryPointSource, discover_plugins
from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.testing import FakeIssueGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_core.gt.testing import FakeGtGateway
from twerk_objectives.context import ObjectiveCliContext
from twerk_pr_address.cli.pr_address.context import PrAddressCliContext
from twerk_reviewer import git_toplevel as git_toplevel_module
from twerk_reviewer.context import ReviewerCliContext
from twerk_reviewer.gateways.harness_detection.fake import FakeHarnessDetectionGateway
from twerk_reviewer.gateways.local_diff.fake import FakeLocalDiffGateway
from twerk_reviewer.gateways.review_definition.fake import FakeReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.fake import FakeReviewExecutionGateway
from twerk_reviewer.models import (
    FindingsReview,
    LocalDiff,
    ReviewExecutionResponse,
    ReviewFinding,
)


class FakePluginEntryPoint:
    def __init__(self, *, name: str, value: str) -> None:
        self.name = name
        self.value = value


class FakePluginEntryPointSource(PluginEntryPointSource):
    def __init__(self, *, entry_points: tuple[FakePluginEntryPoint, ...]) -> None:
        self._entry_points = entry_points

    def get_entry_points(self) -> tuple[FakePluginEntryPoint, ...]:
        return self._entry_points


def _entry_point_source(*entry_points: FakePluginEntryPoint) -> FakePluginEntryPointSource:
    return FakePluginEntryPointSource(entry_points=entry_points)


def test_discover_plugins_skips_plugin_that_fails_to_load() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(name="crasher", value="nonexistent.module.path")

    discover_plugins(parent, source=_entry_point_source(ep))

    assert len(parent.commands) == 0


def test_discover_plugins_no_plugins() -> None:
    parent = click.Group("test")

    discover_plugins(parent, source=_entry_point_source())

    assert len(parent.commands) == 0


def test_discover_plugins_skips_entry_point_that_returns_group_not_plugin_spec() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(
        name="legacy_slots",
        value="twerk_slots.cli.slot.group:build_slot_group",
    )

    discover_plugins(parent, source=_entry_point_source(ep))

    assert len(parent.commands) == 0


def test_objective_plugin_integration() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(
        name="objective",
        value="twerk_objectives.plugin:build_objective_plugin",
    )

    discover_plugins(parent, source=_entry_point_source(ep))

    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "clinkr-migration/body.md", "feat/x", "seed\n")
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
        pr_gateway=FakePRGateway(),
        gt_gateway=FakeGtGateway(),
    )
    obj = build_clinkr_context_object(lambda: ctx)

    runner = CliRunner()

    result = runner.invoke(parent, ["objective", "--help"])
    assert result.exit_code == 0
    assert "list" in result.output

    result = runner.invoke(parent, ["objective", "list", "--here"], obj=obj)
    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == ["clinkr-migration"]

    result = runner.invoke(
        parent,
        ["objective", "list", "--here", "--format", "json"],
        obj=obj,
    )
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    assert payload["data"]["entries"][0]["key"] == "clinkr-migration/body.md"

    # The hidden ``exec`` subgroup must mount through plugin discovery.
    result = runner.invoke(parent, ["objective", "--help"])
    assert result.exit_code == 0
    assert "exec" not in result.output
    result = runner.invoke(parent, ["objective", "exec", "digest", "--help"])
    assert result.exit_code == 0, result.output
    assert "Emit raw digest facts" in result.output


def test_pr_address_plugin_integration() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(
        name="pr_address",
        value="twerk_pr_address.cli.plugin:build_pr_address_plugin",
    )

    discover_plugins(parent, source=_entry_point_source(ep))

    runner = CliRunner()
    ctx = PrAddressCliContext(
        gh_issue_gateway=FakeIssueGateway(),
        git_gateway=FakeGitGateway(),
    )
    obj = build_clinkr_context_object(lambda: ctx)

    # Plugin mounts at expected subgroup name; exec subgroup is hidden, so it
    # must not appear in top-level help output.
    result = runner.invoke(parent, ["pr-address", "--help"])
    assert result.exit_code == 0
    assert "exec" not in result.output

    # A representative operation routes correctly through the plugin path,
    # confirming the exec subgroup is still invocable despite being hidden.
    result = runner.invoke(parent, ["pr-address", "exec", "get-review-comments", "99"], obj=obj)
    assert result.exit_code == 0
    output = json.loads(result.output)
    assert output["count"] == 0


def test_reviewer_plugin_integration(monkeypatch: pytest.MonkeyPatch) -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(
        name="reviewer",
        value="twerk_reviewer.cli.plugin:build_reviewer_plugin",
    )

    discover_plugins(parent, source=_entry_point_source(ep))

    repo_root = Path("/repo")

    def fake_git_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if cmd[:3] == ["git", "rev-parse", "--show-toplevel"]:
            return subprocess.CompletedProcess(cmd, 0, stdout=f"{repo_root}\n", stderr="")
        raise AssertionError(f"unexpected git command: {cmd!r}")

    monkeypatch.setattr(git_toplevel_module.subprocess, "run", fake_git_run)

    runner = CliRunner()

    obj = ReviewerCliContext(
        review_definition=FakeReviewDefinitionGateway(
            sources_by_path={
                repo_root / "reviews" / "dignified-python.md": (
                    "---\n"
                    "description: Review Python diffs for style violations.\n"
                    "default_model: sonnet\n"
                    "---\n"
                    "\n"
                    "Flag concrete issues in the diff.\n"
                )
            }
        ),
        local_diff=FakeLocalDiffGateway(
            default_result=LocalDiff(
                base_ref="master",
                diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
            )
        ),
        review_execution=FakeReviewExecutionGateway(
            default_response=ReviewExecutionResponse(
                payload=FindingsReview(
                    findings=(
                        ReviewFinding(
                            path="app.py",
                            line=1,
                            severity="warning",
                            summary="Avoid print in library code",
                            details="Use click.echo() or structured logging instead.",
                        ),
                    )
                )
            )
        ),
        harness_detection=FakeHarnessDetectionGateway(
            paths_by_binary={"claude": "/usr/local/bin/claude"}
        ),
        issue_gateway=FakeIssueGateway(),
        cwd=Path("/anywhere"),
    )

    clinkr_obj = build_clinkr_context_object(lambda: obj)

    result = runner.invoke(
        parent,
        ["reviewer", "review", "run", "dignified-python"],
        obj=clinkr_obj,
    )
    assert result.exit_code == 0, result.output
    assert "dignified-python" in result.output

    result = runner.invoke(
        parent,
        ["reviewer", "review", "run", "dignified-python", "--format", "json"],
        obj=clinkr_obj,
    )
    assert result.exit_code == 0, result.output
    output = json.loads(result.stdout)
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["count"] == 1
    assert data["findings"][0]["path"] == "app.py"
