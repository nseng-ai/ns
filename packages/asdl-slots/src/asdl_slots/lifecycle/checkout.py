"""Branch checkout into the slot lifecycle pool."""

from __future__ import annotations

from asdl_core.git.types import WorktreeOccupancy
from asdl_slots.checkout_planning import (
    AssignToSlot,
    BranchInMainWorktree,
    BranchInUse,
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
from asdl_slots.inventory import SlotRecord, build_slot_inventory
from asdl_slots.lifecycle.outcomes import SlotCheckoutOutcome, SlotLifecycleFailure
from asdl_slots.repo_context import ensure_slots_metadata_dir

ExecutableCheckoutPlan = ReuseAssignment | BranchInMainWorktree | AssignToSlot


def _assigned_detail(record: SlotRecord) -> str:
    suffix = ""
    if record.operation is not None:
        suffix = f" ({record.operation} in progress)"
    return f"  {record.slot_name} -> {record.branch}{suffix}"


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
    if isinstance(plan, BranchInUse):
        return _branch_in_use_failure(plan.occupancy)
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
    if isinstance(current_plan.plan, BranchInUse):
        return _branch_in_use_failure(current_plan.plan.occupancy)
    return _execute_plan(
        current_plan.plan,
        slots_ctx=slots_ctx,
        branch_name=current_plan.branch_name,
        created_branch=False,
        current_wt_note=current_plan.current_wt_note,
    )


def _pool_full_failure(outcome: PoolFull) -> SlotLifecycleFailure:
    if outcome.assigned:
        details = "\n".join(_assigned_detail(record) for record in outcome.assigned)
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


def _branch_in_use_failure(occupancy: WorktreeOccupancy) -> SlotLifecycleFailure:
    if occupancy.operation == "rebase":
        message = (
            f"Branch '{occupancy.branch}' has a rebase in progress at {occupancy.path}. "
            "Run `git rebase --continue`/`--abort` there, then retry."
        )
    elif occupancy.operation == "bisect":
        message = (
            f"Branch '{occupancy.branch}' has a bisect in progress at {occupancy.path}. "
            "Run `git bisect reset` there, then retry."
        )
    else:
        message = f"Branch '{occupancy.branch}' is already checked out at {occupancy.path}."
    return SlotLifecycleFailure(error_type="branch_in_use", message=message)


def _execute_plan(
    plan: ExecutableCheckoutPlan,
    *,
    slots_ctx: SlotsCliContext,
    branch_name: str,
    created_branch: bool,
    current_wt_note: str | None,
) -> SlotCheckoutOutcome | SlotLifecycleFailure:
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

    failure = slots_ctx.git.checkout_branch(plan.record.path, branch_name)
    if failure is not None:
        return SlotLifecycleFailure(
            error_type="checkout_failed",
            message=(
                f"Failed to check out '{branch_name}' into {plan.record.slot_name}: "
                f"{failure.message}"
            ),
        )
    return SlotCheckoutOutcome(
        slot_name=plan.record.slot_name,
        branch_name=branch_name,
        worktree_path=plan.record.path,
        already_assigned=False,
        created_branch=created_branch,
        current_wt_note=current_wt_note,
    )
