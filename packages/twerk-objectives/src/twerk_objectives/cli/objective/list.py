from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import Any

import click

from clinkr.command import ClinkrCommandError
from clinkr.operation import clinkr_operation
from twerk_objectives.gateway import ObjectiveIssueSummary


@dataclass(frozen=True)
class ObjectiveListRequest:
    """Request for listing objectives."""

    state: str = "open"


@dataclass(frozen=True)
class ObjectiveListResult:
    objectives: tuple[ObjectiveIssueSummary, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "objectives": [o.to_json_dict() for o in self.objectives],
            "count": len(self.objectives),
        }


def render_objective_list(result: ObjectiveListResult) -> None:
    if not result.objectives:
        click.echo("No objectives found.")
        return
    for obj in result.objectives:
        date = obj.updated_at[:10]
        click.echo(f"#{obj.number:<5} {obj.title:<60} {date}")


@clinkr_operation(
    name="list",
    help="List objectives.",
    aliases=("ls",),
    human_renderer=render_objective_list,
)
def run_list_objectives(
    request: ObjectiveListRequest,
) -> ObjectiveListResult | ClinkrCommandError:
    from twerk_objectives.cli.objective._gateway_access import (
        get_objectives_gateway,
    )

    try:
        gateway = get_objectives_gateway()
        summaries = gateway.list_objectives(state=request.state)
    except subprocess.CalledProcessError as e:
        return ClinkrCommandError(message=f"Failed to list objectives: {e.stderr or e}")
    return ObjectiveListResult(objectives=summaries)
