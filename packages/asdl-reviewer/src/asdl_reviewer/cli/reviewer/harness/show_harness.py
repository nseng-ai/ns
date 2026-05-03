from __future__ import annotations

from dataclasses import dataclass

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_reviewer.context import ReviewerCliContext
from asdl_reviewer.workflow import resolve_harness


@dataclass(frozen=True)
class HarnessShowRequest:
    pass


@dataclass(frozen=True)
class HarnessShowResult(JsonSerializable):
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
        harness_detection_gateway=reviewer_context.harness_detection,
    )
    harness_name = Ensure.ideal_state(resolved)

    return ClinkrExit.ok(HarnessShowResult(harness_name=harness_name))
