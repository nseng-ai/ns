from __future__ import annotations

import json
from pathlib import Path

import click
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.git.testing import FakeGitGateway
from asdl_objectives.context import ObjectiveCliContext
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
        name="legacy_group",
        value="asdl_objectives.group:build_objective_group",
    )

    discover_plugins(parent, source=_entry_point_source(ep))

    assert len(parent.commands) == 0


def test_objective_plugin_integration(tmp_path: Path) -> None:
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
    assert "archive" in result.output
    assert "Archive or unarchive an Objective record" in result.output
    assert "list" in result.output
    assert "List Objective records" in result.output
    assert "exec" not in result.output

    result = runner.invoke(parent, ["objective", "exec", "--help"])
    assert result.exit_code == 0, result.output
    assert "Commands for use by objective skills." in result.output

    ctx = ObjectiveCliContext(
        repo_root=tmp_path,
        trunk_branch="master",
        git=FakeGitGateway(repo_root=tmp_path, branches=("master",), trunk_branch="master"),
    )
    result = runner.invoke(
        parent,
        ["objective", "list", "--format", "json"],
        obj=build_clinkr_context_object(lambda: ctx),
    )
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["data"] == {
        "trunk_branch": "master",
        "root_path": ".asdl/objectives",
        "status_filter": "active",
        "names_only": False,
        "updated_branches_included": True,
        "records": [],
    }


def test_aretro_is_not_mounted_as_parent_asdl_plugin() -> None:
    parent = click.Group("test")
    stale_ep = FakePluginEntryPoint(
        name="aretro",
        value="aretro.plugin:build_aretro_plugin",
    )

    discover_plugins(parent, source=_entry_point_source(stale_ep))

    assert "aretro" not in parent.commands
