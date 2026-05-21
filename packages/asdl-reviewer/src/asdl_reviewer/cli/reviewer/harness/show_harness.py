from __future__ import annotations

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_reviewer.context import ReviewerCliContext
from asdl_reviewer.workflow import resolve_harness


class HarnessShowRequest(ClinkrModel):
    pass


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
    reviewer_context = load_typed_context(ctx, ReviewerCliContext)

    resolved = resolve_harness(
        requested_harness=None,
        harness_runtime=reviewer_context.harness_runtime,
    )
    harness_name = Ensure.ideal_state(resolved)

    return ClinkrExit.ok(HarnessShowResult(harness_name=harness_name))
