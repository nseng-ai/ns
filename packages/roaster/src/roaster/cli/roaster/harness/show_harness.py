from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from roaster.context import RoasterCliContext
from roaster.workflow import resolve_harness


class HarnessShowRequest(ClinkrModel):
    name: Annotated[
        str | None,
        click.Argument(["name"], required=False, type=str),
    ] = None


class HarnessShowResult(ClinkrModel):
    harness_name: str


def render_harness_show(result: HarnessShowResult) -> None:
    click.echo(f"Harness: {result.harness_name}")


@clinkr_operation(
    name="show",
    help="Print the harness that would be used for a review.",
    human_renderer=render_harness_show,
)
def run_harness_show_command(
    ctx: click.Context,
    request: HarnessShowRequest,
) -> ClinkrExit[HarnessShowResult]:
    roaster_context = load_typed_context(ctx, RoasterCliContext)

    resolved = resolve_harness(
        requested_harness=request.name,
        harness_runtime=roaster_context.harness_runtime,
    )
    harness_name = Ensure.ideal_state(resolved)

    return ClinkrExit.ok(HarnessShowResult(harness_name=harness_name))
