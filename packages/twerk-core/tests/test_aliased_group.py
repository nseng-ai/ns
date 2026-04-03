import click
from click.testing import CliRunner

from twerk_core import AliasedGroup


def test_aliased_group_resolves_alias():
    @click.group("test", cls=AliasedGroup)
    def grp():
        pass

    @grp.command("list")
    def list_cmd():
        click.echo("listed")

    grp.add_alias("list", "ls")

    runner = CliRunner()
    result = runner.invoke(grp, ["ls"])
    assert result.exit_code == 0
    assert "listed" in result.output


def test_aliased_group_canonical_name_works():
    @click.group("test", cls=AliasedGroup)
    def grp():
        pass

    @grp.command("list")
    def list_cmd():
        click.echo("listed")

    grp.add_alias("list", "ls")

    runner = CliRunner()
    result = runner.invoke(grp, ["list"])
    assert result.exit_code == 0
    assert "listed" in result.output


def test_aliased_group_help_shows_aliases():
    @click.group("test", cls=AliasedGroup)
    def grp():
        pass

    @grp.command("list")
    def list_cmd():
        """List things."""

    grp.add_alias("list", "ls")

    runner = CliRunner()
    result = runner.invoke(grp, ["--help"])
    assert result.exit_code == 0
    assert "list (ls)" in result.output


def test_aliased_group_unknown_command():
    @click.group("test", cls=AliasedGroup)
    def grp():
        pass

    @grp.command("list")
    def list_cmd():
        click.echo("listed")

    runner = CliRunner()
    result = runner.invoke(grp, ["nonexistent"])
    assert result.exit_code != 0
