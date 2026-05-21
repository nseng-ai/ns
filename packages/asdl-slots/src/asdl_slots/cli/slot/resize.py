from __future__ import annotations

from typing import Annotated

import click

from asdl_core import get_console
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_slots.cli.slot.context import load_slots_context
from asdl_slots.lifecycle.outcomes import SlotLifecycleFailure, SlotResizeOutcome
from asdl_slots.lifecycle.pool import resize_pool
from asdl_slots.repo_context import NoRepoSentinel


class SlotResizeRequest(ClinkrModel):
    size: Annotated[
        int,
        click.Option(
            ["--size"],
            required=True,
            help="Target pool size (1..99).",
        ),
    ]


class SlotResizeResult(ClinkrModel):
    previous_pool_size: int
    pool_size: int
    created: tuple[str, ...]
    removed: tuple[str, ...]
    worktrees_dir: str


def render_slot_resize(result: SlotResizeResult) -> None:
    console = get_console()
    if not result.created and not result.removed:
        console.print(
            f"Pool already at size [bold cyan]{result.pool_size}[/bold cyan]; no changes."
        )
        return
    console.print(
        f"Resized pool [dim]{result.previous_pool_size}[/dim] -> "
        f"[bold cyan]{result.pool_size}[/bold cyan] at [dim]{result.worktrees_dir}[/dim]"
    )
    for name in result.created:
        console.print(f"  + [bold cyan]{name}[/bold cyan]")
    for name in result.removed:
        console.print(f"  - [bold cyan]{name}[/bold cyan]")


def _outcome_to_result(outcome: SlotResizeOutcome) -> SlotResizeResult:
    return SlotResizeResult(
        previous_pool_size=outcome.previous_pool_size,
        pool_size=outcome.pool_size,
        created=outcome.created,
        removed=outcome.removed,
        worktrees_dir=str(outcome.worktrees_dir),
    )


@clinkr_operation(
    name="resize",
    help=(
        "Grow or shrink the worktree pool to --size slots (shrink refuses assigned or dirty slots)."
    ),
    human_renderer=render_slot_resize,
)
def run_resize_slots(
    ctx: click.Context, request: SlotResizeRequest
) -> ClinkrExit[SlotResizeResult]:
    slots_ctx_result = load_slots_context(ctx)
    if isinstance(slots_ctx_result, NoRepoSentinel):
        Ensure.fail(error_type="not_in_repo", message=slots_ctx_result.message)
    slots_ctx = slots_ctx_result

    outcome = resize_pool(slots_ctx, request.size)
    if isinstance(outcome, SlotLifecycleFailure):
        return ClinkrExit.failure(error_type=outcome.error_type, message=outcome.message)
    return ClinkrExit.ok(_outcome_to_result(outcome))
