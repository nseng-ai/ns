from __future__ import annotations

import pytest
from click.testing import CliRunner

from asdl.cli.cli import build_cli
from asdl.cli.plugins import PluginEntryPointSource
from asdl_slots.repo_context import NoRepoSentinel


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


def test_cli_help():
    runner = CliRunner()
    result = runner.invoke(build_cli(source=_entry_point_source()), ["--help"])
    assert result.exit_code == 0
    assert "asdl CLI" in result.output


def test_cli_version():
    runner = CliRunner()
    result = runner.invoke(build_cli(source=_entry_point_source()), ["--version"])
    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_top_level_cli_installs_plugin_context_for_slot_commands(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runner = CliRunner()
    slot_plugin = FakePluginEntryPoint(
        name="slots",
        value="asdl_slots.cli.plugin:build_slot_plugin",
    )
    monkeypatch.setattr(
        "asdl_slots.cli.plugin.build_slots_context",
        lambda: NoRepoSentinel(message="Not inside a git repository"),
    )
    cli = build_cli(source=_entry_point_source(slot_plugin))

    result = runner.invoke(cli, ["slot", "free", "--num", "1"])

    assert result.exit_code == 2
    assert "Not inside a git repository" in result.output
    assert "ClinkrContextObject" not in result.output
