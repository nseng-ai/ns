from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, NoReturn

import click

from twerk_core import get_console
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_slots.allocation import (
    DirtyWorktreeError,
    SlotAllocationError,
    SlotNotAssignedError,
    free_slot_assignment,
)
from twerk_slots.cli.slot.context import load_slots_context
from twerk_slots.cli.slot.selectors import (
    SelectorOk,
    SelectorResult,
    resolve_current,
    resolve_num,
    resolve_wt,
)
from twerk_slots.context import SlotsCliContext
from twerk_slots.pool_state import AssignmentMissing, PoolState
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
    current: Annotated[bool, click.Option(["-c", "--current"], is_flag=True, default=False)] = False


@dataclass(frozen=True)
class FreedSlot:
    slot_name: str
    branch_name: str
    worktree_path: str


@dataclass(frozen=True)
class SlotFreeResult(JsonSerializable):
    freed: tuple[FreedSlot, ...]


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

    def absorb(result: SelectorResult) -> None:
        if isinstance(result, SelectorOk):
            if result.slot_name not in seen:
                seen.add(result.slot_name)
                resolved.append(result.slot_name)
        else:
            errors.append(result.message)

    for value in request.num:
        absorb(resolve_num(value, state.pool_size))

    for value in request.wt:
        absorb(resolve_wt(value))

    if request.current:
        absorb(resolve_current(slots_ctx.repo.root))

    return tuple(resolved), tuple(errors)


def validate_assigned_and_clean(
    slots_ctx: SlotsCliContext,
    state: PoolState,
    targets: tuple[str, ...],
) -> tuple[str, ...]:
    """For each resolved slot, check it is assigned and the worktree is clean."""
    errors: list[str] = []
    for slot_name in targets:
        lookup = state.find_by_slot(slot_name)
        if isinstance(lookup, AssignmentMissing):
            errors.append(
                f"{slot_name} is not currently assigned. Run `slot list` to see the pool."
            )
            continue
        assignment = lookup.assignment
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
        raise ClinkrExit.failure(error_type="not_in_repo", message=slots_ctx.message)

    if not slots_ctx.pool_state.exists():
        raise ClinkrExit.failure(
            error_type="pool_empty",
            message="No pool configured. Run `slot checkout` first.",
        )
    state = slots_ctx.pool_state.load()

    if not request.num and not request.wt and not request.current:
        raise ClinkrExit.failure(
            error_type="missing_slot_arg",
            message="Pass one of -n/--num, -w/--wt, or -c/--current to identify the slot.",
        )

    targets, shape_errors = _resolve_targets(slots_ctx, request, state)
    state_errors = validate_assigned_and_clean(slots_ctx, state, targets)
    all_errors = (*shape_errors, *state_errors)
    if all_errors:
        raise ClinkrExit.failure(
            error_type="invalid_slot_args",
            message="\n".join(all_errors),
        )

    freed: list[FreedSlot] = []
    for slot_name in targets:
        try:
            outcome = free_slot_assignment(slots_ctx, slot_name=slot_name)
        except SlotAllocationError as exc:
            partial_failure(freed, error_type="slot_allocation_error", message=str(exc))
        if isinstance(outcome, SlotNotAssignedError):
            partial_failure(
                freed,
                error_type="slot_not_assigned",
                message=f"{slot_name} is not currently assigned (state changed during free).",
            )
        if isinstance(outcome, DirtyWorktreeError):
            partial_failure(
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


def partial_failure(
    freed: list[FreedSlot],
    *,
    error_type: str,
    message: str,
) -> NoReturn:
    """Raise a `ClinkrExit.failure` that lists already-freed slots if any."""
    if not freed:
        raise ClinkrExit.failure(error_type=error_type, message=message)
    already = ", ".join(f.slot_name for f in freed)
    raise ClinkrExit.failure(
        error_type=error_type,
        message=f"{message} Already freed: {already}.",
    )
