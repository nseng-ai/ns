"""Free assigned slots back to the pool."""

from __future__ import annotations

import subprocess
from collections.abc import Sequence

from asdl_slots.context import SlotsCliContext
from asdl_slots.inventory import build_slot_inventory
from asdl_slots.lifecycle.outcomes import (
    FreedSlot,
    SlotFreeCleanupAction,
    SlotFreeCleanupResult,
    SlotFreeOutcome,
    SlotFreePlan,
    SlotLifecycleFailure,
)
from asdl_slots.lifecycle.release import (
    execute_release_cleanup,
    free_operation_in_progress_message,
    plan_free_release_plan,
    plan_release_cleanup,
)

SLOT_FREE_ALL_CLEANUP_ACTIONS: tuple[SlotFreeCleanupAction, ...] = (
    "pr",
    "local_branch",
)


def plan_free_slots(
    slots_ctx: SlotsCliContext,
    slot_names: Sequence[str],
    *,
    preflight_errors: Sequence[str] = (),
    trunk_branch: str | None = None,
) -> SlotFreePlan | SlotLifecycleFailure:
    """Validate selected slots and return the free plan without mutating state."""
    return plan_free_release_plan(
        slots_ctx,
        slot_names,
        preflight_errors=preflight_errors,
        trunk_branch=trunk_branch,
    )


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
        record = inventory.find_by_slot(target.slot_name)
        if record is None or record.branch is None:
            return SlotLifecycleFailure(
                error_type="slot_not_assigned",
                message=_partial_failure_message(
                    f"{target.slot_name} is not currently assigned (state changed during free).",
                    freed,
                ),
            )
        if record.operation is not None:
            return SlotLifecycleFailure(
                error_type="operation_in_progress",
                message=_partial_failure_message(
                    free_operation_in_progress_message(
                        slot_name=record.slot_name,
                        branch_name=record.branch,
                        worktree_path=record.path,
                        operation=record.operation,
                        action="freeing",
                    ),
                    freed,
                ),
            )
        if slots_ctx.git.has_uncommitted_changes(record.path):
            return SlotLifecycleFailure(
                error_type="dirty_worktree",
                message=_partial_failure_message(
                    f"{target.slot_name} has uncommitted changes at {record.path} "
                    f"(state changed during free).",
                    freed,
                ),
            )
        try:
            slots_ctx.git.detach_head(record.path, plan.trunk_branch)
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else str(exc)
            return SlotLifecycleFailure(
                error_type="slot_allocation_error",
                message=_partial_failure_message(
                    f"Failed to detach {target.slot_name} at {record.path} "
                    f"to {plan.trunk_branch}: {stderr}",
                    freed,
                ),
            )
        freed.append(
            FreedSlot(
                slot_name=record.slot_name,
                branch_name=record.branch,
                worktree_path=record.path,
            )
        )

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


def _partial_failure_message(base: str, freed: list[FreedSlot]) -> str:
    if not freed:
        return base
    already = ", ".join(f.slot_name for f in freed)
    return f"{base} Already freed: {already}."
