from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core import get_console
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_slots.allocation import (
    DirtyWorktreeError,
    SlotAllocationError,
    SlotNotAssignedError,
    free_slot_assignment,
)
from twerk_slots.cli.slot.context import load_slots_context
from twerk_slots.cli.slot.slot_target import resolve_slot_target
from twerk_slots.naming import extract_slot_number
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotFreeRequest:
    num: Annotated[int | None, click.Option(["--num"], type=click.INT, default=None)] = None
    wt: Annotated[str | None, click.Option(["--wt"], type=click.STRING, default=None)] = None
    current: Annotated[bool, click.Option(["-c", "--current"], is_flag=True, default=False)] = False


@dataclass(frozen=True)
class SlotFreeResult:
    slot_name: str
    branch_name: str
    worktree_path: str
    placeholder_branch: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slot_name": self.slot_name,
            "branch_name": self.branch_name,
            "worktree_path": self.worktree_path,
            "placeholder_branch": self.placeholder_branch,
        }


def render_slot_free(result: SlotFreeResult) -> None:
    console = get_console()
    console.print(
        f"[green]✓[/green] Freed [bold cyan]{result.slot_name}[/bold cyan] "
        f"([yellow]{result.branch_name}[/yellow])"
    )
    console.print(
        f"  Worktree kept at [dim]{result.worktree_path}[/dim]; "
        f"checked out placeholder [dim]{result.placeholder_branch}[/dim]"
    )


@clinkr_operation(
    name="free",
    help="Release a slot assignment; keep the worktree directory for reuse.",
    human_renderer=render_slot_free,
)
def run_free_slot(
    ctx: click.Context, request: SlotFreeRequest
) -> SlotFreeResult | ClinkrCommandError:
    slots_ctx = load_slots_context(ctx)
    if isinstance(slots_ctx, NoRepoSentinel):
        return ClinkrCommandError(error_type="not_in_repo", message=slots_ctx.message)

    if not slots_ctx.pool_state.exists():
        return ClinkrCommandError(
            error_type="pool_empty",
            message="No pool configured. Run `slot checkout` first.",
        )
    state = slots_ctx.pool_state.load()

    inputs_provided = sum((request.num is not None, request.wt is not None, request.current))
    if inputs_provided > 1:
        return ClinkrCommandError(
            error_type="conflicting_slot_args",
            message="Pass exactly one of --num, --wt, or --current.",
        )
    if inputs_provided == 0:
        return ClinkrCommandError(
            error_type="missing_slot_arg",
            message="Pass one of --num, --wt, or --current to identify the slot.",
        )

    if request.current:
        cwd = slots_ctx.repo.root
        if extract_slot_number(cwd.name) is None:
            return ClinkrCommandError(
                error_type="not_in_slot_wt",
                message=(
                    f"--current requires running from a slot worktree; "
                    f"cwd '{cwd}' is not a slot directory (e.g. 'slot-01')."
                ),
            )
        slot_name = cwd.name
    else:
        slot_name_or_error = resolve_slot_target(
            num=request.num, wt=request.wt, pool_size=state.pool_size
        )
        if isinstance(slot_name_or_error, ClinkrCommandError):
            return slot_name_or_error
        slot_name = slot_name_or_error

    try:
        outcome = free_slot_assignment(slots_ctx, slot_name=slot_name)
    except SlotAllocationError as exc:
        return ClinkrCommandError(error_type="slot_allocation_error", message=str(exc))
    if isinstance(outcome, SlotNotAssignedError):
        return ClinkrCommandError(
            error_type="slot_not_assigned",
            message=f"{slot_name} is not currently assigned. Run `slot list` to see the pool.",
        )
    if isinstance(outcome, DirtyWorktreeError):
        return ClinkrCommandError(
            error_type="dirty_worktree",
            message=(
                f"{slot_name} has uncommitted changes at {outcome.worktree_path}. "
                f"Commit or stash before freeing."
            ),
        )

    return SlotFreeResult(
        slot_name=outcome.slot_name,
        branch_name=outcome.branch_name,
        worktree_path=str(outcome.worktree_path),
        placeholder_branch=outcome.placeholder_branch,
    )
