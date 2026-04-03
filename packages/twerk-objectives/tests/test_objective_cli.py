from __future__ import annotations

from click.testing import CliRunner

from twerk_objectives.cli import cli_group


def test_objective_list() -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list"])
    assert result.exit_code == 0
    assert result.output.strip() == '{\n  "objectives": [],\n  "count": 0\n}'


def test_objective_ls_alias() -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["ls"])
    assert result.exit_code == 0
    assert result.output.strip() == '{\n  "objectives": [],\n  "count": 0\n}'


def test_objective_help() -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--help"])
    assert result.exit_code == 0
    assert "Manage objectives" in result.output
    assert "json" in result.output
    assert "list" in result.output


def test_objective_json_list() -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["json", "list"], input="")
    assert result.exit_code == 0
    assert result.output.strip() == '{\n  "objectives": [],\n  "count": 0,\n  "success": true\n}'


def test_objective_json_list_schema() -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["json", "list", "--schema"])
    assert result.exit_code == 0
    assert '"input_schema"' in result.output
    assert '"output_schema"' in result.output


def test_objective_public_commands_have_json_counterparts() -> None:
    json_group = cli_group.commands["json"]
    public_commands = {name for name in cli_group.commands if name != "json"}

    assert public_commands <= set(json_group.commands)
