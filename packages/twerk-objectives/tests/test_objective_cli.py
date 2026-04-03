from click.testing import CliRunner

from twerk_objectives.cli import cli_group


def test_objective_list() -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list"])
    assert result.exit_code == 0
    assert result.output.strip() == "[]"


def test_objective_ls_alias() -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["ls"])
    assert result.exit_code == 0
    assert result.output.strip() == "[]"


def test_objective_help() -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--help"])
    assert result.exit_code == 0
    assert "Manage objectives" in result.output
    assert "list" in result.output
