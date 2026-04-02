from types import ModuleType
from unittest.mock import patch

import click
from click.testing import CliRunner

from twerk.cli.plugins import ENTRY_POINT_GROUP, discover_plugins


def _make_plugin_module(group: click.Group) -> ModuleType:
    mod = ModuleType("fake_plugin")
    mod.cli_group = group  # type: ignore[attr-defined]
    return mod


def _mock_entry_point(name: str, module: ModuleType | Exception):
    """Create a mock entry point that loads the given module or raises."""

    class FakeEP:
        def __init__(self):
            self.name = name
            self.group = ENTRY_POINT_GROUP

        def load(self):
            if isinstance(module, Exception):
                raise module
            return module

    return FakeEP()


class TestDiscoverPlugins:
    def test_registers_plugin_group(self):
        @click.group("hello")
        def hello_group():
            """A test plugin."""

        @hello_group.command("world")
        def world_cmd():
            click.echo("hello world")

        parent = click.Group("test")
        ep = _mock_entry_point("hello", _make_plugin_module(hello_group))

        with patch("twerk.cli.plugins.entry_points", return_value=[ep]):
            discover_plugins(parent)

        assert "hello" in parent.commands
        runner = CliRunner()
        result = runner.invoke(parent, ["hello", "world"])
        assert result.exit_code == 0
        assert "hello world" in result.output

    def test_skips_plugin_with_no_cli_group(self):
        parent = click.Group("test")
        ep = _mock_entry_point("broken", ModuleType("empty"))

        with patch("twerk.cli.plugins.entry_points", return_value=[ep]):
            discover_plugins(parent)

        assert len(parent.commands) == 0

    def test_skips_plugin_with_invalid_cli_group(self):
        bad_module = ModuleType("bad")
        bad_module.cli_group = "not a click command"  # type: ignore[attr-defined]

        parent = click.Group("test")
        ep = _mock_entry_point("bad", bad_module)

        with patch("twerk.cli.plugins.entry_points", return_value=[ep]):
            discover_plugins(parent)

        assert len(parent.commands) == 0

    def test_skips_plugin_that_fails_to_load(self):
        parent = click.Group("test")
        ep = _mock_entry_point("crasher", ImportError("boom"))

        with patch("twerk.cli.plugins.entry_points", return_value=[ep]):
            discover_plugins(parent)

        assert len(parent.commands) == 0

    def test_no_plugins(self):
        parent = click.Group("test")

        with patch("twerk.cli.plugins.entry_points", return_value=[]):
            discover_plugins(parent)

        assert len(parent.commands) == 0


class TestPluginIntegration:
    def test_objective_plugin(self):
        import twerk_objectives.cli as obj_cli_module

        parent = click.Group("test")
        ep = _mock_entry_point("objectives", obj_cli_module)

        with patch("twerk.cli.plugins.entry_points", return_value=[ep]):
            discover_plugins(parent)

        runner = CliRunner()

        result = runner.invoke(parent, ["objective", "list"])
        assert result.exit_code == 0
        assert "[]" in result.output

        result = runner.invoke(parent, ["objective", "ls"])
        assert result.exit_code == 0
        assert "[]" in result.output
