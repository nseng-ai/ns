from __future__ import annotations

from typing import Annotated

import click

import asdl_slots.inventory as slot_inventory
from asdl_core import get_console
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_slots.cli.slot.context import load_slots_context
from asdl_slots.cli.slot.selectors import (
    SelectorOk,
    SelectorResult,
    resolve_current,
    resolve_num,
    resolve_wt,
)
from asdl_slots.context import SlotsCliContext
from asdl_slots.inventory import MainWorktreeMatch, SlotInventory, SlotMatch
from asdl_slots.lifecycle.free import free_slots
from asdl_slots.lifecycle.outcomes import SlotFreeOutcome, SlotLifecycleFailure
from asdl_slots.repo_context import NoRepoSentinel


class SlotFreeRequest(ClinkrModel):
    num: Annotated[
        tuple[int, ...],
        click.Option(["-n", "--num"], type=click.INT, multiple=True),
    ] = ()
    wt: Annotated[
        tuple[str, ...],
        click.Option(["-w", "--wt"], type=click.STRING, multiple=True),
    ] = ()
    branch: Annotated[
        tuple[str, ...],
        click.Option(["-b", "--branch"], type=click.STRING, multiple=True),
    ] = ()
    current: Annotated[bool, click.Option(["-c", "--current"], is_flag=True, default=False)] = False


class FreedSlot(ClinkrModel):
    slot_name: str
    branch_name: str
    worktree_path: str


class SlotFreeResult(ClinkrModel):
    freed: tuple[FreedSlot, ...]
    skipped: tuple[str, ...] = ()


def render_slot_free(result: SlotFreeResult) -> None:
    console = get_console()
    for message in result.skipped:
        console.print(f"[dim]{message}[/dim]")
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
    inventory: SlotInventory,
) -> tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    """Resolve every selector to a slot name.

    Returns (resolved_in_order, skipped, errors). ``resolved_in_order``
    preserves first-seen order across ``--num`` → ``--wt`` → ``--branch``
    → ``--current`` and is deduped. ``errors`` collects every shape-level
    problem so the caller can surface them in a single combined message.
    """
    resolved: list[str] = []
    seen: set[str] = set()
    skipped: list[str] = []
    errors: list[str] = []

    def absorb(result: SelectorResult) -> None:
        if isinstance(result, SelectorOk):
            if result.slot_name not in seen:
                seen.add(result.slot_name)
                resolved.append(result.slot_name)
        else:
            errors.append(result.message)

    for value in request.num:
        absorb(resolve_num(value, inventory.pool_size))

    for value in request.wt:
        absorb(resolve_wt(value))

    for branch_name in request.branch:
        match = inventory.find_by_branch(branch_name)
        if isinstance(match, SlotMatch):
            absorb(SelectorOk(slot_name=match.record.slot_name))
        elif isinstance(match, MainWorktreeMatch):
            skipped.append(
                f"Branch {branch_name} is checked out in the main worktree, "
                "not a managed slot; nothing to free."
            )
        else:
            skipped.append(
                f"Branch {branch_name} is not checked out in a managed slot; nothing to free."
            )

    if request.current:
        absorb(resolve_current(slots_ctx.repo.root))

    return tuple(resolved), tuple(skipped), tuple(errors)


def _outcome_to_result(outcome: SlotFreeOutcome, skipped: tuple[str, ...]) -> SlotFreeResult:
    return SlotFreeResult(
        freed=tuple(
            FreedSlot(
                slot_name=entry.slot_name,
                branch_name=entry.branch_name,
                worktree_path=str(entry.worktree_path),
            )
            for entry in outcome.freed
        ),
        skipped=skipped,
    )


@clinkr_operation(
    name="free",
    help=(
        "Detach one or more assigned managed slots at trunk; "
        "keep the worktree directories for reuse."
    ),
    human_renderer=render_slot_free,
)
def run_free_slot(ctx: click.Context, request: SlotFreeRequest) -> ClinkrExit[SlotFreeResult]:
    slots_ctx = load_slots_context(ctx)
    if isinstance(slots_ctx, NoRepoSentinel):
        raise ClinkrExit.failure(error_type="not_in_repo", message=slots_ctx.message)

    inventory = slot_inventory.build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    if inventory.pool_size == 0:
        raise ClinkrExit.failure(
            error_type="pool_empty",
            message="No managed slots configured. Run `slot init --size N` first.",
        )

    if not request.num and not request.wt and not request.branch and not request.current:
        raise ClinkrExit.failure(
            error_type="missing_slot_arg",
            message=(
                "Pass one of -n/--num, -w/--wt, -b/--branch, or -c/--current to identify the slot."
            ),
        )

    targets, skipped, shape_errors = _resolve_targets(slots_ctx, request, inventory)
    outcome = free_slots(slots_ctx, targets, preflight_errors=shape_errors)
    if isinstance(outcome, SlotLifecycleFailure):
        return ClinkrExit.failure(error_type=outcome.error_type, message=outcome.message)
    return ClinkrExit.ok(_outcome_to_result(outcome, skipped))
