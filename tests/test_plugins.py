from types import ModuleType

import click
from click.testing import CliRunner

from twerk.cli.plugins import PluginEntryPointSource, discover_plugins


def _make_plugin_module(group: click.Group) -> ModuleType:
    mod = ModuleType("fake_plugin")
    mod.cli_group = group  # type: ignore[attr-defined]
    return mod


class FakePluginEntryPoint:
    def __init__(self, *, name: str, module: ModuleType | Exception) -> None:
        self.name = name
        self._module = module

    def load(self) -> ModuleType:
        if isinstance(self._module, Exception):
            raise self._module
        return self._module


class FakePluginEntryPointSource(PluginEntryPointSource):
    def __init__(self, *, entry_points: tuple[FakePluginEntryPoint, ...]) -> None:
        self._entry_points = entry_points

    def get_entry_points(self) -> tuple[FakePluginEntryPoint, ...]:
        return self._entry_points


def _entry_point_source(*entry_points: FakePluginEntryPoint) -> FakePluginEntryPointSource:
    return FakePluginEntryPointSource(entry_points=entry_points)


class TestDiscoverPlugins:
    def test_registers_plugin_group(self) -> None:
        @click.group("hello")
        def hello_group() -> None:
            """A test plugin."""

        @hello_group.command("world")
        def world_cmd() -> None:
            click.echo("hello world")

        parent = click.Group("test")
        ep = FakePluginEntryPoint(name="hello", module=_make_plugin_module(hello_group))

        discover_plugins(parent, source=_entry_point_source(ep))

        assert "hello" in parent.commands
        runner = CliRunner()
        result = runner.invoke(parent, ["hello", "world"])
        assert result.exit_code == 0
        assert "hello world" in result.output

    def test_skips_plugin_with_no_cli_group(self) -> None:
        parent = click.Group("test")
        ep = FakePluginEntryPoint(name="broken", module=ModuleType("empty"))

        discover_plugins(parent, source=_entry_point_source(ep))

        assert len(parent.commands) == 0

    def test_skips_plugin_with_invalid_cli_group(self) -> None:
        bad_module = ModuleType("bad")
        bad_module.cli_group = "not a click command"  # type: ignore[attr-defined]

        parent = click.Group("test")
        ep = FakePluginEntryPoint(name="bad", module=bad_module)

        discover_plugins(parent, source=_entry_point_source(ep))

        assert len(parent.commands) == 0

    def test_skips_plugin_that_fails_to_load(self) -> None:
        parent = click.Group("test")
        ep = FakePluginEntryPoint(name="crasher", module=ImportError("boom"))

        discover_plugins(parent, source=_entry_point_source(ep))

        assert len(parent.commands) == 0

    def test_no_plugins(self) -> None:
        parent = click.Group("test")

        discover_plugins(parent, source=_entry_point_source())

        assert len(parent.commands) == 0


class TestPluginIntegration:
    def test_objective_plugin(self) -> None:
        import twerk_objectives.cli as obj_cli_module

        parent = click.Group("test")
        ep = FakePluginEntryPoint(name="objectives", module=obj_cli_module)

        discover_plugins(parent, source=_entry_point_source(ep))

        runner = CliRunner()

        result = runner.invoke(parent, ["objective", "list"])
        assert result.exit_code == 0
        assert "[]" in result.output

        result = runner.invoke(parent, ["objective", "ls"])
        assert result.exit_code == 0
        assert "[]" in result.output
