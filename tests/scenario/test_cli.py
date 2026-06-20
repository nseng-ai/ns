from __future__ import annotations

from click.testing import CliRunner

from asdl_tools.cli.cli import build_cli
from asdl_tools.cli.plugins import PluginEntryPointSource


class FakePluginEntryPoint:
    def __init__(self, *, name: str, value: str) -> None:
        self.name = name
        self.value = value


class FakePluginEntryPointSource(PluginEntryPointSource):
    def __init__(self, *, entry_points: tuple[FakePluginEntryPoint, ...]) -> None:
        self._entry_points = entry_points
        self.call_count = 0

    def get_entry_points(self) -> tuple[FakePluginEntryPoint, ...]:
        self.call_count += 1
        return self._entry_points


def _entry_point_source(*entry_points: FakePluginEntryPoint) -> FakePluginEntryPointSource:
    return FakePluginEntryPointSource(entry_points=entry_points)


def test_cli_help() -> None:
    runner = CliRunner()
    cli = build_cli(source=_entry_point_source())

    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "asdl CLI" in result.output
    assert "exec" not in result.output

    short_result = runner.invoke(cli, ["-h"])
    assert short_result.exit_code == 0
    assert "asdl CLI" in short_result.output
    assert "exec" not in short_result.output


def test_cli_version() -> None:
    runner = CliRunner()
    result = runner.invoke(build_cli(source=_entry_point_source()), ["--version"])
    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_cli_runtime_does_not_discover_plugins() -> None:
    runner = CliRunner()
    source = _entry_point_source(FakePluginEntryPoint(name="bad", value="missing.module:build"))
    result = runner.invoke(build_cli(source=source), ["--runtime"])
    assert result.exit_code == 0
    assert result.output == "runtime: python\nentry_point: asdl_tools.cli.cli:main\n"
    assert source.call_count == 0


def test_root_exec_group_is_retired() -> None:
    runner = CliRunner()
    result = runner.invoke(build_cli(source=_entry_point_source()), ["exec", "--help"])

    assert result.exit_code != 0
    assert "No such command 'exec'" in result.output
