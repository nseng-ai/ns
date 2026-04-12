from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
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
from twerk_slots.pool_state import PoolState, SlotAssignment
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotFreeRequest:
    slot: Annotated[str | None, click.Argument(["slot"], required=False)] = None


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


def _resolve_slot_arg(arg: str, *, pool_size: int) -> str | None:
    """Return the canonical slot name for ``arg`` (a number or full name).

    Returns None when ``arg`` is neither a valid slot number in range nor a
    canonically-formatted slot name.
    """
    if arg.isdigit():
        slot_num = int(arg)
        if 1 <= slot_num <= pool_size:
            return generate_slot_name(slot_num)
        return None
    if extract_slot_number(arg) is not None:
        return arg
    return None


def _find_assignment_by_cwd(state: PoolState, cwd: Path) -> SlotAssignment | None:
    """Find an assignment whose worktree contains ``cwd``.

    Uses filesystem resolution directly (no gateway) because cwd detection
    is a pure path comparison against the (already-persisted) assignment
    paths — it does not probe git state.
    """
    if not cwd.exists():
        return None
    resolved_cwd = cwd.resolve()
    for assignment in state.assignments:
        if not assignment.worktree_path.exists():
            continue
        wt_path = assignment.worktree_path.resolve()
        if resolved_cwd == wt_path or wt_path in resolved_cwd.parents:
            return assignment
    return None


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

    if request.slot is not None:
        resolved = _resolve_slot_arg(request.slot, pool_size=state.pool_size)
        if resolved is None:
            return ClinkrCommandError(
                error_type="invalid_slot_arg",
                message=(
                    f"'{request.slot}' is not a valid slot number (1..{state.pool_size}) "
                    f"or slot name (e.g. 'slot-01')."
                ),
            )
        slot_name = resolved
    else:
        assignment = _find_assignment_by_cwd(state, Path.cwd())
        if assignment is None:
            return ClinkrCommandError(
                error_type="cwd_not_in_slot",
                message=(
                    "Not inside a pool slot. Pass a slot number or name, "
                    "or cd into a slot worktree."
                ),
            )
        slot_name = assignment.slot_name

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
