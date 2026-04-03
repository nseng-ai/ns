from __future__ import annotations

import click
import pytest
from click.testing import CliRunner

from clinkr.group import ClinkrGroup


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


def test_json_subgroup_auto_provisioned() -> None:
    group = ClinkrGroup("test")
    assert "json" in group.commands
    assert isinstance(group.commands["json"], click.Group)


def test_json_subgroup_accessible_via_property() -> None:
    group = ClinkrGroup("test")
    assert group.json_group is group.commands["json"]


def test_cannot_add_command_named_json() -> None:
    group = ClinkrGroup("test")

    @click.command("json")
    def bad() -> None:
        pass

    with pytest.raises(ValueError, match="reserved subgroup"):
        group.add_command(bad)


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


def test_json_listed_last_in_help() -> None:
    group = _make_group()

    runner = CliRunner()
    result = runner.invoke(group, ["--help"])
    assert result.exit_code == 0
    lines = result.output.splitlines()
    command_lines = [
        line.strip() for line in lines if line.strip().startswith(("hello", "bye", "json"))
    ]
    assert command_lines[-1].startswith("json")
