from __future__ import annotations

import click

from twerk_core.click_utils import AliasedGroup
from twerk_objectives.commands.json import json_group
from twerk_objectives.commands.list.cli import list_objectives


@click.group("objective", cls=AliasedGroup)
def cli_group() -> None:
    """Manage objectives."""


cli_group.add_command(list_objectives, name="list")
cli_group.add_command(json_group, name="json")
cli_group.add_alias("list", "ls")
