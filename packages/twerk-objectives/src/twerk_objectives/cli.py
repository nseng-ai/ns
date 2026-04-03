from __future__ import annotations

import click

from twerk_core import AliasedGroup


@click.group("objective", cls=AliasedGroup)
def cli_group() -> None:
    """Manage objectives."""


@cli_group.command("list")
def list_objectives() -> None:
    """List objectives."""
    click.echo("[]")


cli_group.add_alias("list", "ls")
