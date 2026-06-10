from __future__ import annotations

import click
from click.testing import CliRunner

from asdl_core.cli_runtime import add_runtime_option


def _build_cli() -> click.Command:
    @click.command(context_settings={"help_option_names": ["-h", "--help"]})
    def cli() -> None:
        click.echo("ran")

    add_runtime_option(cli, runtime="python", entry_point="example.cli:main")
    return cli


def test_runtime_option_prints_diagnostics_and_exits_zero() -> None:
    result = CliRunner().invoke(_build_cli(), ["--runtime"])

    assert result.exit_code == 0
    assert result.output == "runtime: python\nentry_point: example.cli:main\n"


def test_runtime_option_is_listed_in_help() -> None:
    result = CliRunner().invoke(_build_cli(), ["--help"])

    assert result.exit_code == 0
    assert "--runtime" in result.output
