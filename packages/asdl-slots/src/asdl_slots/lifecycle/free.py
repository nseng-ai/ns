"""Free assigned slots back to the pool."""

from __future__ import annotations

from collections.abc import Sequence

from asdl_slots.context import SlotsCliContext
from asdl_slots.inventory import SlotInventory, build_slot_inventory
from asdl_slots.lifecycle.outcomes import (
    FreedSlot,
    SlotFreeCleanupAction,
    SlotFreeCleanupResult,
    SlotFreeOutcome,
    SlotFreePlan,
    SlotLifecycleFailure,
)
from asdl_slots.lifecycle.release_cleanup import (
    SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
    execute_release_cleanup,
    plan_release_cleanup,
)
from asdl_slots.lifecycle.release_target import (
    ReleaseTargetFailure,
    free_operation_in_progress_message,
    freed_slot_from_record,
    release_assigned_slot_target,
)

SLOT_FREE_ALL_CLEANUP_ACTIONS = SLOT_RELEASE_ALL_CLEANUP_ACTIONS


def plan_free_slots(
    slots_ctx: SlotsCliContext,
    slot_names: Sequence[str],
    *,
    preflight_errors: Sequence[str] = (),
    trunk_branch: str | None = None,
) -> SlotFreePlan | SlotLifecycleFailure:
    """Validate selected slots and return the free plan without mutating state."""
    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )

    state_errors = _validate_assigned_and_clean(slots_ctx, inventory, slot_names)
    all_errors = (*preflight_errors, *state_errors)
    if all_errors:
        return SlotLifecycleFailure(
            error_type="invalid_slot_args",
            message="\n".join(all_errors),
        )

    trunk = trunk_branch if trunk_branch is not None else slots_ctx.git.get_trunk_branch()
    targets: list[FreedSlot] = []
    for slot_name in slot_names:
        record = inventory.find_by_slot(slot_name)
        if record is None or record.branch is None:
            return SlotLifecycleFailure(
                error_type="slot_not_assigned",
                message=(f"{slot_name} is not currently assigned (state changed during planning)."),
            )
        if record.operation is not None:
            return SlotLifecycleFailure(
                error_type="operation_in_progress",
                message=free_operation_in_progress_message(
                    slot_name=record.slot_name,
                    branch_name=record.branch,
                    worktree_path=record.path,
                    operation=record.operation,
                    action="freeing",
                ),
            )
        targets.append(freed_slot_from_record(record))

    return SlotFreePlan(targets=tuple(targets), trunk_branch=trunk)


def execute_free_plan(
    slots_ctx: SlotsCliContext,
    plan: SlotFreePlan,
) -> SlotFreeOutcome | SlotLifecycleFailure:
    """Detach every target in ``plan``, preserving existing recheck semantics."""
    if not plan.targets:
        return SlotFreeOutcome(freed=())

    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )

    freed: list[FreedSlot] = []
    for target in plan.targets:
        result = release_assigned_slot_target(
            slots_ctx.git,
            inventory,
            target,
            plan.trunk_branch,
            operation_action="freeing",
        )
        if isinstance(result, ReleaseTargetFailure):
            return SlotLifecycleFailure(
                error_type=result.error_type,
                message=_partial_failure_message(_free_execution_failure_message(result), freed),
            )
        freed.append(result)

    return SlotFreeOutcome(freed=tuple(freed))


def free_slots(
    slots_ctx: SlotsCliContext,
    slot_names: Sequence[str],
    *,
    preflight_errors: Sequence[str] = (),
    trunk_branch: str | None = None,
) -> SlotFreeOutcome | SlotLifecycleFailure:
    if not slot_names and not preflight_errors:
        return SlotFreeOutcome(freed=())

    plan = plan_free_slots(
        slots_ctx,
        slot_names,
        preflight_errors=preflight_errors,
        trunk_branch=trunk_branch,
    )
    if isinstance(plan, SlotLifecycleFailure):
        return plan
    return execute_free_plan(slots_ctx, plan)


def plan_cleanup_for_free_targets(
    slots_ctx: SlotsCliContext,
    targets: Sequence[FreedSlot],
    cleanup_actions: Sequence[SlotFreeCleanupAction],
    *,
    trunk_branch: str | None = None,
) -> tuple[SlotFreeCleanupResult, ...]:
    """Plan cleanup entries for free targets without mutating PRs or branches."""
    return plan_release_cleanup(
        slots_ctx,
        targets,
        cleanup_actions,
        trunk_branch=trunk_branch,
    )


def execute_cleanup_for_freed_slots(
    slots_ctx: SlotsCliContext,
    freed: Sequence[FreedSlot],
    cleanup_actions: Sequence[SlotFreeCleanupAction],
    *,
    trunk_branch: str | None = None,
) -> tuple[SlotFreeCleanupResult, ...]:
    """Run requested cleanup actions for slots that detached successfully."""
    return execute_release_cleanup(
        slots_ctx,
        freed,
        cleanup_actions,
        trunk_branch=trunk_branch,
    )


def _validate_assigned_and_clean(
    slots_ctx: SlotsCliContext,
    inventory: SlotInventory,
    slot_names: Sequence[str],
) -> tuple[str, ...]:
    errors: list[str] = []
    for slot_name in slot_names:
        record = inventory.find_by_slot(slot_name)
        if record is None or record.branch is None:
            errors.append(
                f"{slot_name} is not currently assigned. Run `slot list` to see the pool."
            )
            continue
        if record.operation is not None:
            errors.append(
                free_operation_in_progress_message(
                    slot_name=record.slot_name,
                    branch_name=record.branch,
                    worktree_path=record.path,
                    operation=record.operation,
                    action="freeing",
                )
            )
            continue
        if slots_ctx.git.has_uncommitted_changes(record.path):
            errors.append(
                f"{slot_name} has uncommitted changes at {record.path}. "
                f"Commit or stash before freeing."
            )
    return tuple(errors)


def _free_execution_failure_message(failure: ReleaseTargetFailure) -> str:
    if failure.reason == "slot_not_assigned":
        return f"{failure.slot_name} is not currently assigned (state changed during free)."
    if failure.reason == "dirty_worktree":
        return (
            f"{failure.slot_name} has uncommitted changes at {failure.worktree_path} "
            "(state changed during free)."
        )
    return failure.message


def _partial_failure_message(base: str, freed: list[FreedSlot]) -> str:
    if not freed:
        return base
    already = ", ".join(f.slot_name for f in freed)
    return f"{base} Already freed: {already}."
