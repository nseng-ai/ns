from __future__ import annotations

import click

from twerk_objectives.commands.list.json_cli import json_list_objectives


@click.group("json")
def json_group() -> None:
    """Canonical machine-readable objective commands."""


json_group.add_command(json_list_objectives, name="list")
