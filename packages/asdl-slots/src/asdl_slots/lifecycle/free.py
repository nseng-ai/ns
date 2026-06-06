"""Free assigned slots back to the pool."""

from __future__ import annotations

from collections.abc import Sequence

from asdl_slots.context import SlotsCliContext
from asdl_slots.inventory import SlotInventory, build_slot_inventory
from asdl_slots.lifecycle.operation_state import slot_operation_in_progress_message
from asdl_slots.lifecycle.outcomes import (
    FreedSlot,
    SlotFreeOutcome,
    SlotFreePlan,
    SlotLifecycleFailure,
)
from asdl_slots.lifecycle.release_target import (
    ReleaseTargetFailure,
    freed_slot_from_record,
    release_assigned_slot_target,
)


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

    targets, state_errors = _validated_free_targets(slots_ctx, inventory, slot_names)
    all_errors = (*preflight_errors, *state_errors)
    if all_errors:
        return SlotLifecycleFailure(
            error_type="invalid_slot_args",
            message="\n".join(all_errors),
        )

    trunk = trunk_branch if trunk_branch is not None else slots_ctx.git.get_trunk_branch()
    return SlotFreePlan(targets=targets, trunk_branch=trunk)


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


def _validated_free_targets(
    slots_ctx: SlotsCliContext,
    inventory: SlotInventory,
    slot_names: Sequence[str],
) -> tuple[tuple[FreedSlot, ...], tuple[str, ...]]:
    errors: list[str] = []
    targets: list[FreedSlot] = []
    for slot_name in slot_names:
        record = inventory.find_by_slot(slot_name)
        if record is None or record.branch is None:
            errors.append(
                f"{slot_name} is not currently assigned. Run `slot list` to see the pool."
            )
            continue
        if record.operation is not None:
            errors.append(
                slot_operation_in_progress_message(
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
            continue
        targets.append(freed_slot_from_record(record))
    return tuple(targets), tuple(errors)


def _free_execution_failure_message(failure: ReleaseTargetFailure) -> str:
    if failure.reason == "slot_not_assigned":
        return f"{failure.slot_name} is not currently assigned (state changed during free)."
    if failure.reason == "operation_in_progress":
        return slot_operation_in_progress_message(
            slot_name=failure.slot_name,
            branch_name=failure.branch_name,
            worktree_path=failure.worktree_path,
            operation=failure.operation or "operation",
            action="freeing",
        )
    if failure.reason == "dirty_worktree":
        return (
            f"{failure.slot_name} has uncommitted changes at {failure.worktree_path} "
            "(state changed during free)."
        )
    return _detach_failure_message(failure)


def _detach_failure_message(failure: ReleaseTargetFailure) -> str:
    detach_ref = failure.detach_ref or "target ref"
    detach_error = f": {failure.detach_error}" if failure.detach_error else ""
    return (
        f"Failed to detach {failure.slot_name} at {failure.worktree_path} "
        f"to {detach_ref}{detach_error}"
    )


def _partial_failure_message(base: str, freed: list[FreedSlot]) -> str:
    if not freed:
        return base
    already = ", ".join(f.slot_name for f in freed)
    return f"{base} Already freed: {already}."
