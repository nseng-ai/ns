from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core import get_console
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_slots.allocation import find_assignment_by_slot
from twerk_slots.cli.slot.context import load_slots_context
from twerk_slots.cli.slot.slot_target import resolve_slot_target
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotGotoRequest:
    num: Annotated[int | None, click.Option(["--num"], type=click.INT, default=None)] = None
    wt: Annotated[str | None, click.Option(["--wt"], type=click.STRING, default=None)] = None


@dataclass(frozen=True)
class SlotGotoResult:
    slot_name: str
    branch_name: str
    worktree_path: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slot_name": self.slot_name,
            "branch_name": self.branch_name,
            "worktree_path": self.worktree_path,
        }


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
        return ClinkrExit[SlotGotoResult].failure(
            error_type="not_in_repo", message=slots_ctx.message
        )

    if not slots_ctx.pool_state.exists():
        return ClinkrExit[SlotGotoResult].failure(
            error_type="pool_empty",
            message="No pool configured. Run `slot checkout` first.",
        )
    state = slots_ctx.pool_state.load()

    slot_name_or_error = resolve_slot_target(
        num=request.num, wt=request.wt, pool_size=state.pool_size
    )
    if isinstance(slot_name_or_error, ClinkrCommandError):
        return ClinkrExit[SlotGotoResult].failure(
            error_type=slot_name_or_error.error_type,
            message=slot_name_or_error.message,
        )
    slot_name = slot_name_or_error

    assignment = find_assignment_by_slot(state, slot_name)
    if assignment is None:
        return ClinkrExit[SlotGotoResult].negative(
            message=f"{slot_name} is not currently assigned. Run `slot list` to see the pool.",
        )

    if not slots_ctx.storage.path_exists(assignment.worktree_path):
        return ClinkrExit[SlotGotoResult].failure(
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
