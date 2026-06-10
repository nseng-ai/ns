from __future__ import annotations

import click
from click.testing import CliRunner

from asdl_core.cli_runtime import add_runtime_option


def _build_command() -> click.Command:
    @click.command()
    def cli() -> None:
        click.echo("ran")

    return add_runtime_option(cli, runtime="python", entry_point="demo.cli:main")


def test_runtime_option_prints_runtime_diagnostics_and_exits_zero() -> None:
    result = CliRunner().invoke(_build_command(), ["--runtime"])

    assert result.exit_code == 0
    assert result.output == "runtime: python\nentry_point: demo.cli:main\n"


def test_runtime_option_appears_in_help() -> None:
    result = CliRunner().invoke(_build_command(), ["--help"])

    assert result.exit_code == 0
    assert "--runtime" in result.output
