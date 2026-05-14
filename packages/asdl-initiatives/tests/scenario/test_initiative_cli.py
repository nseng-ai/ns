from __future__ import annotations

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.group import ClinkrGroup
from asdl_initiatives.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_initiative_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: initiative" in result.output
    assert "Work with checked-in Initiative records." in result.output
    assert "--version" in result.output
    assert "exec" not in result.output


def test_initiative_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_initiative_exec_is_hidden_but_invocable(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "--help"])

    assert result.exit_code == 0
    assert "Usage: initiative exec" in result.output
    assert "Commands for use by initiative skills." in result.output
