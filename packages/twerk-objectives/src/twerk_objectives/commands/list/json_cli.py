from __future__ import annotations

import click

from clinkr.machine_command import MachineCommandError, machine_command
from twerk_objectives.commands.list.operation import (
    ObjectiveListRequest,
    ObjectiveListResult,
    run_list_objectives,
)


@machine_command(
    request_type=ObjectiveListRequest,
    output_types=(ObjectiveListResult,),
)
@click.command("list")
def json_list_objectives(
    *,
    request: ObjectiveListRequest,
) -> ObjectiveListResult | MachineCommandError:
    """List objectives as structured JSON."""
    return run_list_objectives(request)
