from __future__ import annotations

from click.testing import CliRunner

from twerk.cli.cli import cli


def test_cli_help():
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "twerk CLI" in result.output
