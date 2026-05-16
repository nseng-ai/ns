from __future__ import annotations

import click

from asdl_core import get_console
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import DetachedHead
from asdl_core.git.types import GitCommandFailure as GitFailure
from asdl_core.gt.types import GtCommandFailure
from asdl_slots.cli.slot.free import FreedSlot
from asdl_slots.cli.slot.gt.context import load_slot_gt_context
from asdl_slots.cli.slot.gt.stack_walk import collect_stack_branches
from asdl_slots.inventory import SlotMatch, build_slot_inventory
from asdl_slots.lifecycle import SlotFreeOutcome, SlotLifecycleFailure, free_slots
from asdl_slots.repo_context import NoRepoSentinel


class SlotGtFreeStackRequest(ClinkrModel):
    pass


class SlotGtFreeStackResult(ClinkrModel):
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

    outcome = free_slots(slots_ctx, tuple(targets), trunk_branch=trunk)
    if isinstance(outcome, SlotLifecycleFailure):
        raise ClinkrExit.failure(error_type=outcome.error_type, message=outcome.message)
    assert isinstance(outcome, SlotFreeOutcome)

    return ClinkrExit.ok(
        SlotGtFreeStackResult(
            current_branch=current,
            trunk_branch=trunk,
            freed=tuple(
                FreedSlot(
                    slot_name=entry.slot_name,
                    branch_name=entry.branch_name,
                    worktree_path=str(entry.worktree_path),
                )
                for entry in outcome.freed
            ),
            noop_reason=None,
        )
    )
