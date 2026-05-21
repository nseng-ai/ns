from __future__ import annotations

import json
from pathlib import Path

import click
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.testing import FakeIssueGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_reviewer.context import ReviewerCliContext
from asdl_reviewer.gateways.local_diff.fake import FakeLocalDiffGateway
from asdl_reviewer.gateways.review_catalog.fake import FakeReviewCatalogGateway
from asdl_reviewer.harness.fake import FakeHarnessRuntime
from asdl_reviewer.models import (
    FindingsReview,
    LocalDiff,
    ReviewExecutionResponse,
    ReviewFinding,
)
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.gateway.testing.storage import FakeSlotsStorageGateway
from asdl_slots.repo_context import RepoContext, discover_repo_or_sentinel
from asdl_tools.cli.plugins import PluginEntryPointSource, discover_plugins


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
        value="asdl_slots.cli.slot.group:build_slot_group",
    )

    discover_plugins(parent, source=_entry_point_source(ep))

    assert len(parent.commands) == 0


def test_objective_plugin_integration() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(
        name="objective",
        value="asdl_objectives.plugin:build_objective_plugin",
    )

    discover_plugins(parent, source=_entry_point_source(ep))

    runner = CliRunner()

    result = runner.invoke(parent, ["objective", "--help"])
    assert result.exit_code == 0
    assert "Work with checked-in Objective records." in result.output
    assert "list" in result.output
    assert "exec" not in result.output

    result = runner.invoke(parent, ["objective", "exec", "--help"])
    assert result.exit_code == 0, result.output
    assert "Commands for use by objective skills." in result.output

    with runner.isolated_filesystem():
        result = runner.invoke(
            parent,
            ["objective", "list", "--format", "json"],
            obj=build_clinkr_context_object(lambda: object()),
        )
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["data"]["root_path"] == ".asdl/objectives"
    assert payload["data"]["entries"] == []


def test_pr_address_plugin_integration() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(
        name="pr_address",
        value="asdl_pr_address.cli.plugin:build_pr_address_plugin",
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


def test_slots_plugin_integration(tmp_path: Path) -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(
        name="slot",
        value="asdl_slots.cli.plugin:build_slot_plugin",
    )

    discover_plugins(parent, source=_entry_point_source(ep))

    slots_root = tmp_path / "slots"
    repo_root = (tmp_path / "repo").resolve()
    repo_root.mkdir()
    storage = FakeSlotsStorageGateway(existing_paths={repo_root, Path.cwd()})
    git = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=repo_root / ".git",
        trunk_branch="main",
        existing_paths={repo_root, Path.cwd()},
        repository_root_by_cwd={Path.cwd().resolve(): repo_root},
        on_add_worktree=storage.ensure_dir,
    )
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=slots_root, git=git)
    assert isinstance(repo, RepoContext)
    ctx = SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=slots_root,
    )
    obj = build_clinkr_context_object(lambda: ctx)

    runner = CliRunner()

    result = runner.invoke(parent, ["slot", "--help"])
    assert result.exit_code == 0
    for cmd in ("init", "resize", "list"):
        assert cmd in result.output

    result = runner.invoke(parent, ["slot", "init", "--size", "2", "--format", "json"], obj=obj)
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["data"]["pool_size"] == 2

    result = runner.invoke(parent, ["slot", "resize", "--size", "4", "--format", "json"], obj=obj)
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["data"]["created"] == ["slot-03", "slot-04"]

    result = runner.invoke(parent, ["slot", "list", "--format", "json"], obj=obj)
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    rows = payload["data"]["rows"]
    assert [row["slot_name"] for row in rows] == [
        "slot-01",
        "slot-02",
        "slot-03",
        "slot-04",
    ]
    assert all(row["status"] == "available" for row in rows)


def test_reviewer_plugin_integration() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(
        name="reviewer",
        value="asdl_reviewer.cli.plugin:build_reviewer_plugin",
    )

    discover_plugins(parent, source=_entry_point_source(ep))

    runner = CliRunner()

    obj = ReviewerCliContext(
        catalog=FakeReviewCatalogGateway(
            review_sources_by_key={
                "dignified-python": (
                    "---\n"
                    "description: Review Python diffs for style violations.\n"
                    "default_model: sonnet\n"
                    "---\n"
                    "\n"
                    "Flag concrete issues in the diff.\n"
                )
            },
        ),
        diff=FakeLocalDiffGateway(
            default_diff=LocalDiff(
                base_ref="master",
                diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
            ),
        ),
        harness_runtime=FakeHarnessRuntime(
            paths_by_binary={"claude": "/usr/local/bin/claude"},
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
            ),
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
