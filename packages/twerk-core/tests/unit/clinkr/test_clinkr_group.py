from __future__ import annotations

import click
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup


def _make_group() -> ClinkrGroup:
    group = ClinkrGroup("test", help="Test group.")

    @click.command("hello")
    def hello() -> None:
        """Say hello."""
        click.echo("hello")

    @click.command("bye")
    def bye() -> None:
        """Say bye."""
        click.echo("bye")

    group.add_command(hello)
    group.add_command(bye)
    return group


def test_alias_resolution() -> None:
    group = _make_group()
    group.add_alias("hello", "hi")

    runner = CliRunner()
    result = runner.invoke(group, ["hi"])
    assert result.exit_code == 0
    assert result.output.strip() == "hello"


def test_canonical_name_still_works() -> None:
    group = _make_group()
    group.add_alias("hello", "hi")

    runner = CliRunner()
    result = runner.invoke(group, ["hello"])
    assert result.exit_code == 0
    assert result.output.strip() == "hello"


def test_help_shows_aliases() -> None:
    group = _make_group()
    group.add_alias("hello", "hi")

    runner = CliRunner()
    result = runner.invoke(group, ["--help"])
    assert result.exit_code == 0
    assert "hello (hi)" in result.output
