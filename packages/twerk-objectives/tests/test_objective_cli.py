from __future__ import annotations

import pytest
from click.testing import CliRunner

from clinkr import discover_group
from clinkr.group import ClinkrGroup


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return discover_group("twerk_objectives.cli.objective")


def test_objective_list(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list"])
    assert result.exit_code == 0
    assert result.output.strip() == '{\n  "objectives": [],\n  "count": 0\n}'


def test_objective_ls_alias(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["ls"])
    assert result.exit_code == 0
    assert result.output.strip() == '{\n  "objectives": [],\n  "count": 0\n}'


def test_objective_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--help"])
    assert result.exit_code == 0
    assert "Manage objectives" in result.output
    assert "json" in result.output
    assert "list" in result.output


def test_objective_json_list(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["json", "list"], input="")
    assert result.exit_code == 0
    assert result.output.strip() == '{\n  "objectives": [],\n  "count": 0,\n  "success": true\n}'


def test_objective_json_list_schema(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["json", "list", "--schema"])
    assert result.exit_code == 0
    assert '"input_schema"' in result.output
    assert '"output_schema"' in result.output


def test_objective_public_commands_have_json_counterparts(cli_group: ClinkrGroup) -> None:
    json_group = cli_group.commands["json"]
    public_commands = {name for name in cli_group.commands if name != "json"}

    assert public_commands <= set(json_group.commands)
