from __future__ import annotations

from collections.abc import Sequence
from typing import Annotated

import click

import asdl_slots.cli.slot.cleanup_rendering as cleanup_rendering
import asdl_slots.inventory as slot_inventory
from asdl_core import get_console
from asdl_core.clinkr.context import is_machine_mode
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
from asdl_slots.lifecycle.free import (
    SLOT_FREE_ALL_CLEANUP_ACTIONS,
    execute_cleanup_for_freed_slots,
    execute_free_plan,
    plan_free_slots,
)
from asdl_slots.lifecycle.outcomes import (
    FreedSlot as LifecycleFreedSlot,
)
from asdl_slots.lifecycle.outcomes import (
    SlotFreeCleanupResult as LifecycleCleanupResult,
)
from asdl_slots.lifecycle.outcomes import (
    SlotFreeOutcome,
    SlotFreePlan,
    SlotLifecycleFailure,
)
from asdl_slots.lifecycle.release import plan_free_release_preview
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
    all: Annotated[
        bool,
        click.Option(
            ["--all"],
            is_flag=True,
            default=False,
            help=(
                "Also close the matching GitHub PR and force-delete the local branch after freeing."
            ),
        ),
    ] = False
    dry_run: Annotated[
        bool,
        click.Option(["--dry-run"], is_flag=True, default=False, help="Show the plan only."),
    ] = False
    yes: Annotated[
        bool,
        click.Option(
            ["-y", "--yes"],
            is_flag=True,
            default=False,
            help="Skip confirmation for destructive cleanup.",
        ),
    ] = False


class FreedSlot(ClinkrModel):
    slot_name: str
    branch_name: str
    worktree_path: str


class SlotFreeResult(ClinkrModel):
    freed: tuple[FreedSlot, ...]
    would_free: tuple[FreedSlot, ...] = ()
    cleanup: tuple[cleanup_rendering.SlotCleanupResult, ...] = ()
    skipped: tuple[str, ...] = ()
    dry_run: bool = False
    cancelled: bool = False
    cleanup_error_count: int = 0


def render_slot_free(result: SlotFreeResult) -> None:
    console = get_console()
    for message in result.skipped:
        console.print(f"[dim]{message}[/dim]")

    cleanup_by_slot = cleanup_rendering.cleanup_by_slot(result.cleanup)

    if result.cancelled:
        console.print("Cancelled; no changes made.")
        return

    if result.dry_run:
        for entry in result.would_free:
            console.print(
                f"Would free [bold cyan]{entry.slot_name}[/bold cyan] "
                f"([yellow]{entry.branch_name}[/yellow])"
            )
            console.print("  slot: detach HEAD at trunk")
            for cleanup in cleanup_by_slot.get(entry.slot_name, ()):  # pragma: no branch
                console.print(f"  {cleanup_rendering.cleanup_preview_line(cleanup)}")
        console.print("No changes made.")
        return

    for entry in result.freed:
        console.print(
            f"[green]✓[/green] Freed [bold cyan]{entry.slot_name}[/bold cyan] "
            f"([yellow]{entry.branch_name}[/yellow])"
        )
        console.print(
            f"  Worktree kept at [dim]{entry.worktree_path}[/dim]; detached HEAD at trunk"
        )
        for cleanup in cleanup_by_slot.get(entry.slot_name, ()):  # pragma: no branch
            console.print(f"  {cleanup_rendering.cleanup_result_line(cleanup)}")


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


def _outcome_to_result(
    outcome: SlotFreeOutcome,
    skipped: tuple[str, ...],
    cleanup: Sequence[LifecycleCleanupResult] = (),
) -> SlotFreeResult:
    cleanup_entries = cleanup_rendering.cleanup_to_result(cleanup)
    return SlotFreeResult(
        freed=_freed_to_result(outcome.freed),
        cleanup=cleanup_entries,
        skipped=skipped,
        cleanup_error_count=cleanup_rendering.cleanup_error_count(cleanup_entries),
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
    cleanup_actions = SLOT_FREE_ALL_CLEANUP_ACTIONS if request.all else ()

    if request.dry_run:
        preview = plan_free_release_preview(
            slots_ctx,
            targets,
            preflight_errors=shape_errors,
            cleanup_actions=cleanup_actions,
        )
        if isinstance(preview, SlotLifecycleFailure):
            return ClinkrExit.failure(error_type=preview.error_type, message=preview.message)
        cleanup_entries = cleanup_rendering.cleanup_to_result(preview.cleanup)
        result = SlotFreeResult(
            freed=(),
            would_free=_freed_to_result(preview.targets),
            cleanup=cleanup_entries,
            skipped=skipped,
            dry_run=True,
            cleanup_error_count=cleanup_rendering.cleanup_error_count(cleanup_entries),
        )
        if result.cleanup_error_count:
            return ClinkrExit.negative(result, message=_cleanup_error_message(result))
        return ClinkrExit.ok(result)

    free_plan = plan_free_slots(slots_ctx, targets, preflight_errors=shape_errors)
    if isinstance(free_plan, SlotLifecycleFailure):
        return ClinkrExit.failure(error_type=free_plan.error_type, message=free_plan.message)

    cleanup_preview: tuple[LifecycleCleanupResult, ...] = ()
    if cleanup_actions and free_plan.targets and not request.yes:
        if is_machine_mode(ctx):
            return ClinkrExit.failure(
                error_type="confirmation_required",
                message="Destructive cleanup requires --yes in JSON mode (or use --dry-run first).",
            )
        preview = plan_free_release_preview(
            slots_ctx,
            targets,
            preflight_errors=shape_errors,
            cleanup_actions=cleanup_actions,
            trunk_branch=free_plan.trunk_branch,
        )
        if isinstance(preview, SlotLifecycleFailure):
            return ClinkrExit.failure(error_type=preview.error_type, message=preview.message)
        free_plan = SlotFreePlan(targets=preview.targets, trunk_branch=preview.trunk_branch)
        cleanup_preview = preview.cleanup
        _render_confirmation_preview(free_plan, cleanup_preview, skipped)
        if not click.confirm(
            f"Free {len(free_plan.targets)} slot(s) and run cleanup?",
            default=False,
            err=True,
        ):
            cleanup_entries = cleanup_rendering.cleanup_to_result(cleanup_preview)
            return ClinkrExit.ok(
                SlotFreeResult(
                    freed=(),
                    would_free=_freed_to_result(free_plan.targets),
                    cleanup=cleanup_entries,
                    skipped=skipped,
                    cancelled=True,
                    cleanup_error_count=cleanup_rendering.cleanup_error_count(cleanup_entries),
                )
            )

    outcome = execute_free_plan(slots_ctx, free_plan)
    if isinstance(outcome, SlotLifecycleFailure):
        return ClinkrExit.failure(error_type=outcome.error_type, message=outcome.message)

    cleanup_results = execute_cleanup_for_freed_slots(
        slots_ctx,
        outcome.freed,
        cleanup_actions,
        trunk_branch=free_plan.trunk_branch,
    )
    result = _outcome_to_result(outcome, skipped, cleanup_results)
    if result.cleanup_error_count:
        return ClinkrExit.negative(result, message=_cleanup_error_message(result))
    return ClinkrExit.ok(result)


def _freed_to_result(entries: Sequence[LifecycleFreedSlot]) -> tuple[FreedSlot, ...]:
    return tuple(
        FreedSlot(
            slot_name=entry.slot_name,
            branch_name=entry.branch_name,
            worktree_path=str(entry.worktree_path),
        )
        for entry in entries
    )


def _render_confirmation_preview(
    plan: SlotFreePlan,
    cleanup: Sequence[LifecycleCleanupResult],
    skipped: Sequence[str],
) -> None:
    cleanup_entries = cleanup_rendering.cleanup_to_result(cleanup)
    cleanup_by_slot = cleanup_rendering.cleanup_by_slot(cleanup_entries)
    for message in skipped:
        click.echo(message, err=True)
    for target in plan.targets:
        click.echo(f"Will free {target.slot_name} ({target.branch_name})", err=True)
        click.echo("  slot: detach HEAD at trunk", err=True)
        for entry in cleanup_by_slot.get(target.slot_name, ()):  # pragma: no branch
            click.echo(f"  {cleanup_rendering.plain_cleanup_preview_line(entry)}", err=True)


def _cleanup_error_message(result: SlotFreeResult) -> str:
    cleanup_by_slot = cleanup_rendering.cleanup_by_slot(result.cleanup)
    lines: list[str] = []
    entries = result.freed if result.freed else result.would_free
    for entry in entries:
        if result.dry_run and not result.freed:
            lines.append(f"Would free {entry.slot_name} ({entry.branch_name})")
            lines.append("  slot: detach HEAD at trunk")
        else:
            lines.append(f"✓ Freed {entry.slot_name} ({entry.branch_name})")
            lines.append(f"  Worktree kept at {entry.worktree_path}; detached HEAD at trunk")
        for cleanup in cleanup_by_slot.get(entry.slot_name, ()):  # pragma: no branch
            if cleanup.status == "success":
                lines.append(f"  ✓ {cleanup_rendering.cleanup_success_text(cleanup)}")
            elif cleanup.status == "skipped":
                lines.append(f"  - {cleanup_rendering.cleanup_skipped_text(cleanup)}")
            elif cleanup.status == "error":
                lines.append(f"  ✗ {cleanup_rendering.cleanup_failure_text(cleanup)}")
    if not lines:
        return "Cleanup failed."
    return "\n".join(lines)
