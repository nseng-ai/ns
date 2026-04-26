from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core import get_console
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_slots.allocation import (
    DirtyWorktreeError,
    SlotAllocationError,
    SlotNotAssignedError,
    find_assignment_by_slot,
    free_slot_assignment,
)
from twerk_slots.cli.slot.context import load_slots_context
from twerk_slots.context import SlotsCliContext
from twerk_slots.naming import extract_slot_number, generate_slot_name
from twerk_slots.pool_state import PoolState
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotFreeRequest:
    num: Annotated[
        tuple[int, ...],
        click.Option(["-n", "--num"], type=click.INT, multiple=True),
    ] = ()
    wt: Annotated[
        tuple[str, ...],
        click.Option(["-w", "--wt"], type=click.STRING, multiple=True),
    ] = ()
    current: Annotated[
        bool, click.Option(["-c", "--current"], is_flag=True, default=False)
    ] = False


@dataclass(frozen=True)
class FreedSlot:
    slot_name: str
    branch_name: str
    worktree_path: str


@dataclass(frozen=True)
class SlotFreeResult:
    freed: tuple[FreedSlot, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "freed": [
                {
                    "slot_name": f.slot_name,
                    "branch_name": f.branch_name,
                    "worktree_path": f.worktree_path,
                }
                for f in self.freed
            ],
        }


def render_slot_free(result: SlotFreeResult) -> None:
    console = get_console()
    for entry in result.freed:
        console.print(
            f"[green]✓[/green] Freed [bold cyan]{entry.slot_name}[/bold cyan] "
            f"([yellow]{entry.branch_name}[/yellow])"
        )
        console.print(
            f"  Worktree kept at [dim]{entry.worktree_path}[/dim]; detached HEAD at trunk"
        )


def _resolve_targets(
    slots_ctx: SlotsCliContext,
    request: SlotFreeRequest,
    state: PoolState,
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Resolve every selector to a slot name.

    Returns (resolved_in_order, errors). ``resolved_in_order`` preserves
    first-seen order across ``--num`` → ``--wt`` → ``--current`` and is
    deduped. ``errors`` collects every shape-level problem so the caller
    can surface them in a single combined message.
    """
    resolved: list[str] = []
    seen: set[str] = set()
    errors: list[str] = []

    for value in request.num:
        if not (1 <= value <= state.pool_size):
            errors.append(f"--num must be in 1..{state.pool_size} (got {value}).")
            continue
        slot_name = generate_slot_name(value)
        if slot_name not in seen:
            seen.add(slot_name)
            resolved.append(slot_name)

    for value in request.wt:
        if extract_slot_number(value) is None:
            errors.append(f"--wt '{value}' is not a valid slot name (e.g. 'slot-01').")
            continue
        if value not in seen:
            seen.add(value)
            resolved.append(value)

    if request.current:
        cwd = slots_ctx.repo.root
        if extract_slot_number(cwd.name) is None:
            errors.append(
                f"--current requires running from a slot worktree; "
                f"cwd '{cwd}' is not a slot directory (e.g. 'slot-01')."
            )
        elif cwd.name not in seen:
            seen.add(cwd.name)
            resolved.append(cwd.name)

    return tuple(resolved), tuple(errors)


def _validate_assigned_and_clean(
    slots_ctx: SlotsCliContext,
    state: PoolState,
    targets: tuple[str, ...],
) -> tuple[str, ...]:
    """For each resolved slot, check it is assigned and the worktree is clean."""
    errors: list[str] = []
    for slot_name in targets:
        assignment = find_assignment_by_slot(state, slot_name)
        if assignment is None:
            errors.append(
                f"{slot_name} is not currently assigned. Run `slot list` to see the pool."
            )
            continue
        if slots_ctx.git.has_uncommitted_changes(assignment.worktree_path):
            errors.append(
                f"{slot_name} has uncommitted changes at {assignment.worktree_path}. "
                f"Commit or stash before freeing."
            )
    return tuple(errors)


@clinkr_operation(
    name="free",
    help="Release one or more slot assignments; keep the worktree directories for reuse.",
    human_renderer=render_slot_free,
)
def run_free_slot(ctx: click.Context, request: SlotFreeRequest) -> ClinkrExit[SlotFreeResult]:
    slots_ctx = load_slots_context(ctx)
    if isinstance(slots_ctx, NoRepoSentinel):
        return ClinkrExit.failure(error_type="not_in_repo", message=slots_ctx.message)

    if not slots_ctx.pool_state.exists():
        return ClinkrExit.failure(
            error_type="pool_empty",
            message="No pool configured. Run `slot checkout` first.",
        )
    state = slots_ctx.pool_state.load()

    if not request.num and not request.wt and not request.current:
        return ClinkrExit.failure(
            error_type="missing_slot_arg",
            message="Pass one of -n/--num, -w/--wt, or -c/--current to identify the slot.",
        )

    targets, shape_errors = _resolve_targets(slots_ctx, request, state)
    state_errors = _validate_assigned_and_clean(slots_ctx, state, targets)
    all_errors = (*shape_errors, *state_errors)
    if all_errors:
        return ClinkrExit.failure(
            error_type="invalid_slot_args",
            message="\n".join(all_errors),
        )

    freed: list[FreedSlot] = []
    for slot_name in targets:
        try:
            outcome = free_slot_assignment(slots_ctx, slot_name=slot_name)
        except SlotAllocationError as exc:
            return _partial_failure(freed, error_type="slot_allocation_error", message=str(exc))
        if isinstance(outcome, SlotNotAssignedError):
            return _partial_failure(
                freed,
                error_type="slot_not_assigned",
                message=f"{slot_name} is not currently assigned (state changed during free).",
            )
        if isinstance(outcome, DirtyWorktreeError):
            return _partial_failure(
                freed,
                error_type="dirty_worktree",
                message=(
                    f"{slot_name} has uncommitted changes at {outcome.worktree_path} "
                    f"(state changed during free)."
                ),
            )
        freed.append(
            FreedSlot(
                slot_name=outcome.slot_name,
                branch_name=outcome.branch_name,
                worktree_path=str(outcome.worktree_path),
            )
        )

    return ClinkrExit.ok(SlotFreeResult(freed=tuple(freed)))


def _partial_failure(
    freed: list[FreedSlot],
    *,
    error_type: str,
    message: str,
) -> ClinkrExit[SlotFreeResult]:
    if not freed:
        return ClinkrExit.failure(error_type=error_type, message=message)
    already = ", ".join(f.slot_name for f in freed)
    return ClinkrExit.failure(
        error_type=error_type,
        message=f"{message} Already freed: {already}.",
    )
