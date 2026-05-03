from __future__ import annotations

import subprocess
from dataclasses import dataclass

import click

from asdl_core import get_console
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import DetachedHead
from asdl_core.git.types import GitCommandFailure as GitFailure
from asdl_core.gt.types import GtCommandFailure
from asdl_slots.cli.slot.free import (
    FreedSlot,
    partial_failure,
    validate_assigned_and_clean,
)
from asdl_slots.cli.slot.gt.context import load_slot_gt_context
from asdl_slots.cli.slot.gt.stack_walk import collect_stack_branches
from asdl_slots.inventory import SlotMatch, build_slot_inventory
from asdl_slots.repo_context import NoRepoSentinel


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
    gt_ctx = load_slot_gt_context(ctx)
    if isinstance(gt_ctx, NoRepoSentinel):
        raise ClinkrExit.failure(error_type="not_in_repo", message=gt_ctx.message)

    slots_ctx = gt_ctx.slots
    current_result = slots_ctx.git.get_current_branch(slots_ctx.repo.root)
    if isinstance(current_result, GitFailure):
        raise ClinkrExit.failure(
            error_type="git_current_branch_failed",
            message=current_result.message,
        )
    if isinstance(current_result, DetachedHead):
        raise ClinkrExit.failure(
            error_type="detached_head",
            message=f"HEAD at {slots_ctx.repo.root} is detached. Check out a branch first.",
        )
    current = current_result

    trunk_result = gt_ctx.gt.trunk(slots_ctx.repo.root)
    if isinstance(trunk_result, GtCommandFailure):
        raise ClinkrExit.failure(error_type="gt_trunk_failed", message=trunk_result.message)
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

    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    if inventory.pool_size == 0:
        raise ClinkrExit.failure(
            error_type="pool_empty",
            message="No managed slots configured. Run `slot init --size N` first.",
        )

    stack_result = gt_ctx.gt.stack(slots_ctx.repo.root)
    if isinstance(stack_result, GtCommandFailure):
        raise ClinkrExit.failure(error_type="gt_stack_failed", message=stack_result.message)
    stack = stack_result

    stack_branches = collect_stack_branches(stack, current=current, trunk=trunk)

    seen: set[str] = set()
    targets: list[str] = []
    for branch in stack_branches:
        # `collect_stack_branches` already excludes current and trunk;
        # double-check here in case a future refactor relaxes that.
        if branch == current or branch == trunk:
            continue
        match = inventory.find_by_branch(branch)
        if not isinstance(match, SlotMatch):
            continue
        slot_name = match.record.slot_name
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
    preflight_errors = validate_assigned_and_clean(slots_ctx, inventory, targets_tuple)
    if preflight_errors:
        raise ClinkrExit.failure(
            error_type="invalid_slot_args",
            message="\n".join(preflight_errors),
        )

    freed: list[FreedSlot] = []
    for slot_name in targets_tuple:
        record = inventory.find_by_slot(slot_name)
        if record is None or record.branch is None:
            partial_failure(
                freed,
                error_type="slot_not_assigned",
                message=f"{slot_name} is not currently assigned (state changed during free).",
            )
        if slots_ctx.git.has_uncommitted_changes(record.path):
            partial_failure(
                freed,
                error_type="dirty_worktree",
                message=(
                    f"{slot_name} has uncommitted changes at {record.path} "
                    f"(state changed during free)."
                ),
            )
        try:
            slots_ctx.git.detach_head(record.path, trunk)
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else str(exc)
            partial_failure(
                freed,
                error_type="slot_allocation_error",
                message=f"Failed to detach {slot_name} at {record.path} to {trunk}: {stderr}",
            )
        freed.append(
            FreedSlot(
                slot_name=record.slot_name,
                branch_name=record.branch,
                worktree_path=str(record.path),
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
