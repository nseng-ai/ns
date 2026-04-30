from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

import click

from twerk_core import get_console
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.ensure import Ensure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.git.types import DetachedHead
from twerk_core.git.types import GitCommandFailure as GitFailure
from twerk_core.gt.types import GtCommandFailure
from twerk_slots.allocation import (
    DirtyWorktreeError,
    SlotAllocationError,
    SlotNotAssignedError,
    free_slot_assignment,
)
from twerk_slots.cli.slot.free import (
    FreedSlot,
    partial_failure,
    validate_assigned_and_clean,
)
from twerk_slots.cli.slot.gt.context import load_slot_gt_context
from twerk_slots.cli.slot.gt.stack_walk import collect_stack_branches
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotGtFreeStackRequest:
    pass


@dataclass(frozen=True)
class SlotGtFreeStackResult(JsonSerializable):
    current_branch: str
    trunk_branch: str
    freed: tuple[FreedSlot, ...]
    noop_reason: str | None


def render_slot_gt_free_stack(result: SlotGtFreeStackResult) -> None:
    console = get_console()
    if result.noop_reason == "on_trunk":
        console.print(
            f"[dim]On trunk ([yellow]{result.trunk_branch}[/yellow]); nothing to free.[/dim]"
        )
        return
    if result.noop_reason == "no_slots":
        console.print("[dim]No slots in stack to free.[/dim]")
        return
    for entry in result.freed:
        console.print(
            f"[green]✓[/green] Freed [bold cyan]{entry.slot_name}[/bold cyan] "
            f"([yellow]{entry.branch_name}[/yellow])"
        )
        console.print(
            f"  Worktree kept at [dim]{entry.worktree_path}[/dim]; detached HEAD at trunk"
        )


@clinkr_operation(
    name="free-stack",
    help=(
        "Release every slot in the current Graphite stack except the slot at the current branch."
    ),
    human_renderer=render_slot_gt_free_stack,
)
def run_gt_free_stack(
    ctx: click.Context, request: SlotGtFreeStackRequest
) -> ClinkrExit[SlotGtFreeStackResult]:
    gt_ctx_result = load_slot_gt_context(ctx)
    if isinstance(gt_ctx_result, NoRepoSentinel):
        Ensure.fail(error_type="not_in_repo", message=gt_ctx_result.message)
    gt_ctx = gt_ctx_result

    slots_ctx = gt_ctx.slots
    current_result = slots_ctx.git.get_current_branch(slots_ctx.repo.root)
    if isinstance(current_result, GitFailure):
        Ensure.fail(
            error_type="git_current_branch_failed",
            message=current_result.message,
        )
    if isinstance(current_result, DetachedHead):
        Ensure.fail(
            error_type="detached_head",
            message=f"HEAD at {slots_ctx.repo.root} is detached. Check out a branch first.",
        )
    current = current_result

    trunk_result = gt_ctx.gt.trunk(slots_ctx.repo.root)
    if isinstance(trunk_result, GtCommandFailure):
        Ensure.fail(error_type="gt_trunk_failed", message=trunk_result.message)
    trunk = trunk_result

    if current == trunk:
        return ClinkrExit.ok(
            SlotGtFreeStackResult(
                current_branch=current,
                trunk_branch=trunk,
                freed=(),
                noop_reason="on_trunk",
            )
        )

    Ensure.true(
        slots_ctx.pool_state.exists(),
        error_type="pool_empty",
        message="No pool configured. Run `slot checkout` first.",
    )
    state = slots_ctx.pool_state.load()

    stack_result = gt_ctx.gt.stack(slots_ctx.repo.root)
    if isinstance(stack_result, GtCommandFailure):
        Ensure.fail(error_type="gt_stack_failed", message=stack_result.message)
    stack = stack_result

    stack_branches = collect_stack_branches(stack, current=current, trunk=trunk)

    branch_to_slots: dict[str, list[str]] = defaultdict(list)
    for assignment in state.assignments:
        branch_to_slots[assignment.branch_name].append(assignment.slot_name)

    seen: set[str] = set()
    targets: list[str] = []
    for branch in stack_branches:
        # `collect_stack_branches` already excludes current and trunk;
        # double-check here in case a future refactor relaxes that.
        if branch == current or branch == trunk:
            continue
        for slot_name in branch_to_slots.get(branch, ()):
            if slot_name in seen:
                continue
            seen.add(slot_name)
            targets.append(slot_name)

    if not targets:
        return ClinkrExit.ok(
            SlotGtFreeStackResult(
                current_branch=current,
                trunk_branch=trunk,
                freed=(),
                noop_reason="no_slots",
            )
        )

    targets_tuple = tuple(targets)
    preflight_errors = validate_assigned_and_clean(slots_ctx, state, targets_tuple)
    Ensure.true(
        not preflight_errors,
        error_type="invalid_slot_args",
        message="\n".join(preflight_errors),
    )

    freed: list[FreedSlot] = []
    for slot_name in targets_tuple:
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

    return ClinkrExit.ok(
        SlotGtFreeStackResult(
            current_branch=current,
            trunk_branch=trunk,
            freed=tuple(freed),
            noop_reason=None,
        )
    )
