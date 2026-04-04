from __future__ import annotations

import click
from click.testing import CliRunner

from twerk.cli.plugins import PluginEntryPointSource, discover_plugins


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


class TestDiscoverPlugins:
    def test_skips_plugin_that_fails_to_load(self) -> None:
        parent = click.Group("test")
        ep = FakePluginEntryPoint(name="crasher", value="nonexistent.module.path")

        discover_plugins(parent, source=_entry_point_source(ep))

        assert len(parent.commands) == 0

    def test_no_plugins(self) -> None:
        parent = click.Group("test")

        discover_plugins(parent, source=_entry_point_source())

        assert len(parent.commands) == 0


class TestPluginIntegration:
    def test_objective_plugin(self) -> None:
        parent = click.Group("test")
        ep = FakePluginEntryPoint(name="objectives", value="twerk_objectives.cli.objective")

        discover_plugins(parent, source=_entry_point_source(ep))

        runner = CliRunner()

        result = runner.invoke(parent, ["objective", "list"])
        assert result.exit_code == 0
        assert "[]" in result.output

        result = runner.invoke(parent, ["objective", "ls"])
        assert result.exit_code == 0
        assert "[]" in result.output

        result = runner.invoke(parent, ["objective", "json", "list"], input="")
        assert result.exit_code == 0
        assert '"success": true' in result.output
