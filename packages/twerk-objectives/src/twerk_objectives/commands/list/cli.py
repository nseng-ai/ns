from __future__ import annotations

import json

import click

from clinkr.machine_command import MachineCommandError
from twerk_objectives.commands.list.operation import (
    ObjectiveListRequest,
    ObjectiveListResult,
    run_list_objectives,
)


@click.command("list")
def list_objectives() -> None:
    """List objectives."""
    result = run_list_objectives(ObjectiveListRequest())
    if isinstance(result, MachineCommandError):
        raise click.ClickException(result.message)
    _render_objectives(result)


def _render_objectives(result: ObjectiveListResult) -> None:
    click.echo(json.dumps([objective.to_json_dict() for objective in result.objectives], indent=2))
