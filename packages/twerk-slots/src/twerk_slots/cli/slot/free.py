from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core import get_console
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_slots.allocation import (
    DirtyWorktreeError,
    SlotNotAssignedError,
    free_slot_assignment,
)
from twerk_slots.cli.slot._context import build_slots_context
from twerk_slots.naming import extract_slot_number, generate_slot_name
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotFreeRequest:
    num: Annotated[int | None, click.Option(["--num"], type=click.INT, default=None)] = None
    wt: Annotated[str | None, click.Option(["--wt"], type=click.STRING, default=None)] = None


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
def run_free_slot(request: SlotFreeRequest) -> SlotFreeResult | ClinkrCommandError:
    ctx = build_slots_context()
    if isinstance(ctx, NoRepoSentinel):
        return ClinkrCommandError(error_type="not_in_repo", message=ctx.message)

    state = ctx.pool_state.load()
    if state is None:
        return ClinkrCommandError(
            error_type="pool_empty",
            message="No pool configured. Run `slot assign` first.",
        )

    if request.num is not None and request.wt is not None:
        return ClinkrCommandError(
            error_type="conflicting_slot_args",
            message="Pass exactly one of --num or --wt, not both.",
        )
    if request.num is not None:
        if not (1 <= request.num <= state.pool_size):
            return ClinkrCommandError(
                error_type="invalid_slot_num",
                message=f"--num must be in 1..{state.pool_size} (got {request.num}).",
            )
        slot_name = generate_slot_name(request.num)
    elif request.wt is not None:
        if extract_slot_number(request.wt) is None:
            return ClinkrCommandError(
                error_type="invalid_slot_wt",
                message=f"--wt '{request.wt}' is not a valid slot name (e.g. 'slot-01').",
            )
        slot_name = request.wt
    else:
        return ClinkrCommandError(
            error_type="missing_slot_arg",
            message="Pass one of --num or --wt to identify the slot.",
        )

    outcome = free_slot_assignment(ctx, slot_name=slot_name)
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
