from __future__ import annotations

import click
from click.testing import CliRunner

from twerk_core.click_utils import AliasedGroup


def test_aliased_group_resolves_alias() -> None:
    @click.group("test", cls=AliasedGroup)
    def grp() -> None:
        pass

    @grp.command("list")
    def list_cmd() -> None:
        click.echo("listed")

    grp.add_alias("list", "ls")

    runner = CliRunner()
    result = runner.invoke(grp, ["ls"])
    assert result.exit_code == 0
    assert "listed" in result.output


def test_aliased_group_canonical_name_works() -> None:
    @click.group("test", cls=AliasedGroup)
    def grp() -> None:
        pass

    @grp.command("list")
    def list_cmd() -> None:
        click.echo("listed")

    grp.add_alias("list", "ls")

    runner = CliRunner()
    result = runner.invoke(grp, ["list"])
    assert result.exit_code == 0
    assert "listed" in result.output


def test_aliased_group_help_shows_aliases() -> None:
    @click.group("test", cls=AliasedGroup)
    def grp() -> None:
        pass

    @grp.command("list")
    def list_cmd() -> None:
        """List things."""

    grp.add_alias("list", "ls")

    runner = CliRunner()
    result = runner.invoke(grp, ["--help"])
    assert result.exit_code == 0
    assert "list (ls)" in result.output


def test_aliased_group_unknown_command() -> None:
    @click.group("test", cls=AliasedGroup)
    def grp() -> None:
        pass

    @grp.command("list")
    def list_cmd() -> None:
        click.echo("listed")

    runner = CliRunner()
    result = runner.invoke(grp, ["nonexistent"])
    assert result.exit_code != 0
