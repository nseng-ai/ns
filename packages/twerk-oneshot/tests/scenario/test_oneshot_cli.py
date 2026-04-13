from __future__ import annotations

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_oneshot.cli.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_oneshot_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: oneshot" in result.output
    assert "Queue one-shot remote work." in result.output
    assert "--version" in result.output
    assert "json" not in result.output


def test_oneshot_version_option(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output
