from __future__ import annotations

from typing import Annotated

import click

from asdl_core import get_console
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_slots.cli.slot.context import load_slots_context
from asdl_slots.lifecycle import (
    SlotInitOutcome,
    SlotLifecycleFailure,
    initialize_pool,
)
from asdl_slots.repo_context import NoRepoSentinel


class SlotInitRequest(ClinkrModel):
    size: Annotated[
        int,
        click.Option(
            ["--size"],
            required=True,
            help="Number of slots to create (1..99).",
        ),
    ]


class SlotInitResult(ClinkrModel):
    pool_size: int
    created: tuple[str, ...]
    worktrees_dir: str


def render_slot_init(result: SlotInitResult) -> None:
    console = get_console()
    console.print(
        f"Initialized pool with [bold cyan]{result.pool_size}[/bold cyan] slot(s) at "
        f"[dim]{result.worktrees_dir}[/dim]"
    )
    for name in result.created:
        console.print(f"  + [bold cyan]{name}[/bold cyan]")


def _outcome_to_result(outcome: SlotInitOutcome) -> SlotInitResult:
    return SlotInitResult(
        pool_size=outcome.pool_size,
        created=outcome.created,
        worktrees_dir=str(outcome.worktrees_dir),
    )


@clinkr_operation(
    name="init",
    help="Initialize the worktree pool with N detached slots at trunk.",
    human_renderer=render_slot_init,
)
def run_init_slots(ctx: click.Context, request: SlotInitRequest) -> ClinkrExit[SlotInitResult]:
    slots_ctx_result = load_slots_context(ctx)
    if isinstance(slots_ctx_result, NoRepoSentinel):
        Ensure.fail(error_type="not_in_repo", message=slots_ctx_result.message)
    slots_ctx = slots_ctx_result

    outcome = initialize_pool(slots_ctx, request.size)
    if isinstance(outcome, SlotLifecycleFailure):
        return ClinkrExit.failure(error_type=outcome.error_type, message=outcome.message)
    return ClinkrExit.ok(_outcome_to_result(outcome))
