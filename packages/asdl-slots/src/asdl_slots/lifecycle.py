"""Lifecycle coordination for slot operations."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from asdl_slots.checkout_planning import (
    AssignToSlot,
    BranchInMainWorktree,
    CurrentCheckoutPlan,
    PoolFull,
    ReuseAssignment,
    plan_checkout,
    plan_current_checkout,
)
from asdl_slots.context import SlotsCliContext
from asdl_slots.errors import (
    DetachedHeadError,
    DirtyCurrentWorktreeError,
    SlotAllocationError,
)
from asdl_slots.inventory import SlotInventory, SlotRecord, build_slot_inventory
from asdl_slots.repo_context import ensure_slots_metadata_dir

MIN_POOL_SIZE = 1
MAX_POOL_SIZE = 99


@dataclass(frozen=True)
class InitPlan:
    create: tuple[int, ...]


@dataclass(frozen=True)
class ResizePlan:
    create: tuple[int, ...]
    remove: tuple[SlotRecord, ...]


@dataclass(frozen=True)
class SlotCheckoutOutcome:
    slot_name: str
    branch_name: str
    worktree_path: Path
    already_assigned: bool
    created_branch: bool
    current_wt_note: str | None


@dataclass(frozen=True)
class SlotLifecycleFailure:
    error_type: str
    message: str


ExecutableCheckoutPlan = ReuseAssignment | BranchInMainWorktree | AssignToSlot


def build_init_plan(target_size: int) -> InitPlan:
    return InitPlan(create=tuple(range(1, target_size + 1)))


def build_resize_plan(inventory: SlotInventory, target_size: int) -> ResizePlan:
    if target_size == inventory.pool_size:
        return ResizePlan(create=(), remove=())
    if target_size > inventory.pool_size:
        existing = {record.slot_number for record in inventory.records}
        needed = target_size - inventory.pool_size
        create: list[int] = []
        candidate = 1
        while len(create) < needed:
            if candidate not in existing:
                create.append(candidate)
            candidate += 1
        return ResizePlan(create=tuple(create), remove=())
    sorted_records = sorted(inventory.records, key=lambda r: r.slot_number)
    return ResizePlan(create=(), remove=tuple(sorted_records[target_size:]))


def checkout_branch(
    slots_ctx: SlotsCliContext,
    branch_name: str,
    *,
    new_branch: bool,
    base: str | None,
) -> SlotCheckoutOutcome | SlotLifecycleFailure:
    ensure_slots_metadata_dir(slots_ctx.repo, slots_ctx.storage)

    branch_exists = slots_ctx.git.branch_exists(branch_name)
    created_branch = False
    if new_branch:
        if branch_exists:
            return SlotLifecycleFailure(
                error_type="branch_exists",
                message=(
                    f"Branch '{branch_name}' already exists. "
                    "Drop -b to check out the existing branch."
                ),
            )
        if base is not None and not slots_ctx.git.branch_exists(base):
            return SlotLifecycleFailure(
                error_type="base_missing",
                message=f"Base branch '{base}' does not exist.",
            )
        slots_ctx.git.create_branch(
            branch_name,
            base if base is not None else "HEAD",
            force=False,
        )
        created_branch = True
    elif not branch_exists:
        return SlotLifecycleFailure(
            error_type="branch_missing",
            message=(
                f"Branch '{branch_name}' does not exist. Pass -b/--new to create it from HEAD."
            ),
        )

    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    plan = plan_checkout(inventory, slots_ctx.git, branch_name)
    if isinstance(plan, PoolFull):
        return _pool_full_failure(plan)
    return _execute_plan(
        plan,
        slots_ctx=slots_ctx,
        branch_name=branch_name,
        created_branch=created_branch,
        current_wt_note=None,
    )


def checkout_current(slots_ctx: SlotsCliContext) -> SlotCheckoutOutcome | SlotLifecycleFailure:
    ensure_slots_metadata_dir(slots_ctx.repo, slots_ctx.storage)

    try:
        current_plan = plan_current_checkout(
            slots_ctx.git,
            cwd=slots_ctx.repo.root,
            main_repo_root=slots_ctx.repo.main_repo_root,
        )
    except SlotAllocationError as exc:
        return SlotLifecycleFailure(
            error_type="slot_allocation_error",
            message=str(exc),
        )

    if isinstance(current_plan, DetachedHeadError):
        return SlotLifecycleFailure(
            error_type="detached_head",
            message=(
                f"HEAD at {current_plan.cwd} is detached. Check out a branch "
                "before running `slot checkout --current`."
            ),
        )
    if isinstance(current_plan, DirtyCurrentWorktreeError):
        return SlotLifecycleFailure(
            error_type="dirty_worktree",
            message=(
                f"Current worktree at {current_plan.cwd} has uncommitted changes. "
                "Commit or stash before running `slot checkout --current`."
            ),
        )

    assert isinstance(current_plan, CurrentCheckoutPlan)
    if isinstance(current_plan.plan, PoolFull):
        return _pool_full_failure(current_plan.plan)
    return _execute_plan(
        current_plan.plan,
        slots_ctx=slots_ctx,
        branch_name=current_plan.branch_name,
        created_branch=False,
        current_wt_note=current_plan.current_wt_note,
    )


def _pool_full_failure(outcome: PoolFull) -> SlotLifecycleFailure:
    if outcome.assigned:
        details = "\n".join(
            f"  {record.slot_name} -> {record.branch}" for record in outcome.assigned
        )
        message = (
            f"Pool is full. Currently assigned:\n{details}\n"
            "Free a slot before checking out a new branch."
        )
    else:
        message = (
            "Pool is full (no slots available). "
            "Run `slot init` or `slot resize` before checking out a new branch."
        )
    return SlotLifecycleFailure(error_type="pool_full", message=message)


def _execute_plan(
    plan: ExecutableCheckoutPlan,
    *,
    slots_ctx: SlotsCliContext,
    branch_name: str,
    created_branch: bool,
    current_wt_note: str | None,
) -> SlotCheckoutOutcome:
    if isinstance(plan, ReuseAssignment):
        return SlotCheckoutOutcome(
            slot_name=plan.record.slot_name,
            branch_name=branch_name,
            worktree_path=plan.record.path,
            already_assigned=True,
            created_branch=created_branch,
            current_wt_note=current_wt_note,
        )
    if isinstance(plan, BranchInMainWorktree):
        return SlotCheckoutOutcome(
            slot_name="",
            branch_name=branch_name,
            worktree_path=plan.main_path,
            already_assigned=True,
            created_branch=created_branch,
            current_wt_note=current_wt_note,
        )

    slots_ctx.git.checkout_branch(plan.record.path, branch_name)
    return SlotCheckoutOutcome(
        slot_name=plan.record.slot_name,
        branch_name=branch_name,
        worktree_path=plan.record.path,
        already_assigned=False,
        created_branch=created_branch,
        current_wt_note=current_wt_note,
    )
