from __future__ import annotations

import click
import pytest
from click.testing import CliRunner

from twerk.cli.plugins import PluginEntryPointSource, discover_plugins
from twerk_core.clinkr.group import ClinkrGroup
from twerk_dispatcher.cli.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_dispatcher_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: dispatcher" in result.output
    assert "Dispatch coding tasks to GitHub Actions." in result.output
    assert "--version" in result.output


def test_dispatcher_version(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


class _FakePluginEntryPoint:
    def __init__(self, *, name: str, value: str) -> None:
        self.name = name
        self.value = value


class _FakePluginEntryPointSource(PluginEntryPointSource):
    def __init__(self, *, entry_points: tuple[_FakePluginEntryPoint, ...]) -> None:
        self._entry_points = entry_points

    def get_entry_points(self) -> tuple[_FakePluginEntryPoint, ...]:
        return self._entry_points


def test_dispatcher_plugin_mounts_under_twerk() -> None:
    parent = click.Group("test")
    ep = _FakePluginEntryPoint(
        name="dispatcher",
        value="twerk_dispatcher.cli.plugin:build_dispatcher_plugin",
    )

    discover_plugins(parent, source=_FakePluginEntryPointSource(entry_points=(ep,)))

    runner = CliRunner()
    result = runner.invoke(parent, ["dispatcher", "--help"])

    assert result.exit_code == 0
    assert "Dispatch coding tasks to GitHub Actions." in result.output
