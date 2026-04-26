from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import click

from twerk_core import get_console
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_slots.cli.slot.context import load_slots_context
from twerk_slots.cli.slot.selectors import SelectorOk, resolve_num, resolve_wt
from twerk_slots.pool_state import AssignmentMissing
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotGotoRequest:
    num: Annotated[int | None, click.Option(["--num"], type=click.INT, default=None)] = None
    wt: Annotated[str | None, click.Option(["--wt"], type=click.STRING, default=None)] = None


@dataclass(frozen=True)
class SlotGotoResult(JsonSerializable):
    slot_name: str
    branch_name: str
    worktree_path: str


def render_slot_goto(result: SlotGotoResult) -> None:
    console = get_console()
    console.print(
        f"[bold cyan]{result.slot_name}[/bold cyan] -> [green]{result.branch_name}[/green]"
    )
    # Pipeable worktree path on its own line (last).
    click.echo(result.worktree_path)


@clinkr_operation(
    name="goto",
    help="Print the worktree path for an assigned slot.",
    human_renderer=render_slot_goto,
)
def run_goto_slot(ctx: click.Context, request: SlotGotoRequest) -> ClinkrExit[SlotGotoResult]:
    slots_ctx = load_slots_context(ctx)
    if isinstance(slots_ctx, NoRepoSentinel):
        return ClinkrExit.failure(error_type="not_in_repo", message=slots_ctx.message)

    if not slots_ctx.pool_state.exists():
        return ClinkrExit.failure(
            error_type="pool_empty",
            message="No pool configured. Run `slot checkout` first.",
        )
    state = slots_ctx.pool_state.load()

    if request.num is not None and request.wt is not None:
        return ClinkrExit.failure(
            error_type="conflicting_slot_args",
            message="Pass exactly one of --num or --wt, not both.",
        )
    if request.num is not None:
        result = resolve_num(request.num, state.pool_size)
        if not isinstance(result, SelectorOk):
            return ClinkrExit.failure(error_type="invalid_slot_num", message=result.message)
        slot_name = result.slot_name
    elif request.wt is not None:
        result = resolve_wt(request.wt)
        if not isinstance(result, SelectorOk):
            return ClinkrExit.failure(error_type="invalid_slot_wt", message=result.message)
        slot_name = result.slot_name
    else:
        return ClinkrExit.failure(
            error_type="missing_slot_arg",
            message="Pass one of --num or --wt to identify the slot.",
        )

    lookup = state.find_by_slot(slot_name)
    if isinstance(lookup, AssignmentMissing):
        return ClinkrExit.negative(
            message=f"{slot_name} is not currently assigned. Run `slot list` to see the pool.",
        )
    assignment = lookup.assignment

    if not slots_ctx.storage.path_exists(assignment.worktree_path):
        return ClinkrExit.failure(
            error_type="worktree_missing",
            message=(
                f"Worktree for {slot_name} is missing at {assignment.worktree_path}. "
                f"Run `slot free --wt {slot_name}` to clear the stale assignment."
            ),
        )

    return ClinkrExit.ok(
        SlotGotoResult(
            slot_name=slot_name,
            branch_name=assignment.branch_name,
            worktree_path=str(assignment.worktree_path),
        )
    )
