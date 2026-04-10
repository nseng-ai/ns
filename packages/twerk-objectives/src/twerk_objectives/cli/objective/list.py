from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import Any

import click

from clinkr.command import ClinkrCommandError
from clinkr.operation import clinkr_operation
from twerk_core import format_relative_time, get_console, make_table, state_badge
from twerk_core.gh.types import Issue
from twerk_objectives.cli.objective._gateway_access import get_gh_issue_gateway


@dataclass(frozen=True)
class ObjectiveListRequest:
    """Request for listing objectives."""

    state: str = "open"


@dataclass(frozen=True)
class ObjectiveListResult:
    objectives: tuple[Issue, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "objectives": [
                {
                    "number": i.number,
                    "title": i.title,
                    "state": i.state,
                    "updated_at": i.updated_at,
                }
                for i in self.objectives
            ],
            "count": len(self.objectives),
        }


def render_objective_list(result: ObjectiveListResult) -> None:
    if not result.objectives:
        click.echo("No objectives found.")
        return

    table = make_table()
    table.add_column("#", style="bold cyan", no_wrap=True, justify="right", min_width=4)
    table.add_column("Status", no_wrap=True, min_width=8)
    table.add_column("Title", no_wrap=True, overflow="ellipsis", ratio=1)
    table.add_column("Updated", no_wrap=True, style="dim", justify="right", min_width=7)

    for obj in result.objectives:
        table.add_row(
            f"#{obj.number}",
            state_badge(obj.state),
            obj.title,
            format_relative_time(obj.updated_at),
        )

    get_console().print(table)


@clinkr_operation(
    name="list",
    help="List objectives.",
    aliases=("ls",),
    human_renderer=render_objective_list,
)
def run_list_objectives(
    request: ObjectiveListRequest,
) -> ObjectiveListResult | ClinkrCommandError:
    try:
        gateway = get_gh_issue_gateway()
        issues = gateway.list(label="twerk-objective", state=request.state)
    except subprocess.CalledProcessError as e:
        return ClinkrCommandError(
            error_type="gh_cli_failure",
            message=f"Failed to list objectives: {e.stderr or e}",
        )
    return ObjectiveListResult(objectives=issues)
