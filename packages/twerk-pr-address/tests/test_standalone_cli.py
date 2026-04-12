"""Tests for the standalone pr-address CLI entry point."""

from __future__ import annotations

import pytest
from click.testing import CliRunner

from clinkr.group import ClinkrGroup
from twerk_pr_address.cli.main import build_cli


@pytest.fixture()
def standalone_group() -> ClinkrGroup:
    return build_cli()


def test_version_option(standalone_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(standalone_group, ["--version"])
    assert result.exit_code == 0
    assert "version" in result.output


def test_help_short_flag(standalone_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(standalone_group, ["-h"])
    assert result.exit_code == 0
    assert "PR review address operations." in result.output
    assert "--version" in result.output


def test_subcommands_present(standalone_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(standalone_group, ["-h"])
    assert result.exit_code == 0
    assert "get-feedback" in result.output
    assert "json" in result.output
