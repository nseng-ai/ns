from __future__ import annotations

import click
from click.testing import CliRunner

from twerk.cli.plugins import PluginEntryPointSource, discover_plugins
from twerk_core.gh.testing import FakeIssueGateway


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


def test_objective_plugin_integration() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(name="objectives", value="twerk_objectives.cli.objective")

    discover_plugins(parent, source=_entry_point_source(ep))

    runner = CliRunner()
    obj = {"gh_issue_gateway": FakeIssueGateway()}

    result = runner.invoke(parent, ["objective", "list"], obj=obj)
    assert result.exit_code == 0
    assert "No objectives found." in result.output

    result = runner.invoke(parent, ["objective", "ls"], obj=obj)
    assert result.exit_code == 0
    assert "No objectives found." in result.output

    result = runner.invoke(parent, ["objective", "json", "list"], input="", obj=obj)
    assert result.exit_code == 0
    assert '"success": true' in result.output
