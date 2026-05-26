from __future__ import annotations

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.group import ClinkrGroup
from asdl_retro.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_branch_retro_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: branch-retro" in result.output
    assert "Branch session retrospective evidence operations." in result.output
    assert "--version" in result.output
    assert "exec" not in result.output


def test_branch_retro_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_branch_retro_exec_is_hidden_but_invocable(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "--help"])

    assert result.exit_code == 0
    assert "Usage: branch-retro exec" in result.output
    assert "Commands for use by branch retrospective skills." in result.output
