"""Free assigned slots back to the pool."""

from __future__ import annotations

import subprocess
from collections.abc import Sequence

from asdl_core.gh.types import PRGatewayFailure, PRLookupMiss
from asdl_slots.context import SlotsCliContext
from asdl_slots.inventory import SlotInventory, build_slot_inventory
from asdl_slots.lifecycle.outcomes import (
    FreedSlot,
    SlotFreeCleanupAction,
    SlotFreeCleanupResult,
    SlotFreeCleanupStatus,
    SlotFreeOutcome,
    SlotFreePlan,
    SlotLifecycleFailure,
)

_CLEANUP_ACTION_ORDER: tuple[SlotFreeCleanupAction, ...] = (
    "pr",
    "local_branch",
)


def expand_cleanup_actions(cleanup_values: Sequence[str]) -> tuple[SlotFreeCleanupAction, ...]:
    """Expand user-facing cleanup values into deterministic internal actions."""
    requested: set[SlotFreeCleanupAction] = set()
    for value in cleanup_values:
        if value == "pr":
            requested.add("pr")
        elif value == "branch":
            requested.add("local_branch")
        elif value == "all":
            requested.update(_CLEANUP_ACTION_ORDER)
        else:
            raise ValueError(f"unknown cleanup value: {value}")
    return tuple(action for action in _CLEANUP_ACTION_ORDER if action in requested)


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
                message=f"{slot_name} is not currently assigned (state changed during planning).",
            )
        targets.append(
            FreedSlot(
                slot_name=record.slot_name,
                branch_name=record.branch,
                worktree_path=record.path,
            )
        )

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
        record = inventory.find_by_slot(target.slot_name)
        if record is None or record.branch is None:
            return SlotLifecycleFailure(
                error_type="slot_not_assigned",
                message=_partial_failure_message(
                    f"{target.slot_name} is not currently assigned (state changed during free).",
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
    return _cleanup_for_targets(
        slots_ctx,
        targets,
        cleanup_actions,
        trunk_branch=trunk_branch,
        execute=False,
    )


def execute_cleanup_for_freed_slots(
    slots_ctx: SlotsCliContext,
    freed: Sequence[FreedSlot],
    cleanup_actions: Sequence[SlotFreeCleanupAction],
    *,
    trunk_branch: str | None = None,
) -> tuple[SlotFreeCleanupResult, ...]:
    """Run requested cleanup actions for slots that detached successfully."""
    return _cleanup_for_targets(
        slots_ctx,
        freed,
        cleanup_actions,
        trunk_branch=trunk_branch,
        execute=True,
    )


def _cleanup_for_targets(
    slots_ctx: SlotsCliContext,
    targets: Sequence[FreedSlot],
    cleanup_actions: Sequence[SlotFreeCleanupAction],
    *,
    trunk_branch: str | None,
    execute: bool,
) -> tuple[SlotFreeCleanupResult, ...]:
    if not targets or not cleanup_actions:
        return ()

    needs_trunk = any(action == "local_branch" for action in cleanup_actions)
    resolved_trunk = trunk_branch
    if needs_trunk and resolved_trunk is None:
        resolved_trunk = slots_ctx.git.get_trunk_branch()

    results: list[SlotFreeCleanupResult] = []
    for target in targets:
        for action in cleanup_actions:
            if action == "pr":
                result = _cleanup_pr(slots_ctx, target, execute=execute)
            elif action == "local_branch":
                assert resolved_trunk is not None
                result = _cleanup_local_branch(
                    slots_ctx,
                    target,
                    trunk_branch=resolved_trunk,
                    execute=execute,
                )
            else:
                raise ValueError(f"unknown cleanup action: {action}")
            results.append(result)
            if result.status == "error":
                return tuple(results)
    return tuple(results)


def _cleanup_pr(
    slots_ctx: SlotsCliContext,
    target: FreedSlot,
    *,
    execute: bool,
) -> SlotFreeCleanupResult:
    pr_result = slots_ctx.pr.get_pr_for_branch(target.branch_name)
    if isinstance(pr_result, PRLookupMiss):
        return _cleanup_result(
            target,
            "pr",
            "skipped",
            message="no matching PR",
        )
    if isinstance(pr_result, PRGatewayFailure):
        return _cleanup_result(
            target,
            "pr",
            "error",
            message=_pr_failure_message(pr_result),
        )

    if pr_result.state in ("CLOSED", "MERGED"):
        return _cleanup_result(
            target,
            "pr",
            "skipped",
            pr_number=pr_result.number,
            message=f"PR is already {pr_result.state.lower()}",
        )

    if not execute:
        return _cleanup_result(target, "pr", "planned", pr_number=pr_result.number)

    close_result = slots_ctx.pr.close_pr(pr_result.number)
    if isinstance(close_result, PRGatewayFailure):
        return _cleanup_result(
            target,
            "pr",
            "error",
            pr_number=pr_result.number,
            message=_pr_failure_message(close_result),
        )
    return _cleanup_result(target, "pr", "success", pr_number=pr_result.number)


def _cleanup_local_branch(
    slots_ctx: SlotsCliContext,
    target: FreedSlot,
    *,
    trunk_branch: str,
    execute: bool,
) -> SlotFreeCleanupResult:
    if target.branch_name == trunk_branch:
        return _cleanup_result(
            target,
            "local_branch",
            "error",
            message=f"refusing to delete trunk branch {trunk_branch}",
        )
    if not execute:
        return _cleanup_result(target, "local_branch", "planned")

    if not slots_ctx.git.branch_exists(target.branch_name):
        return _cleanup_result(target, "local_branch", "skipped", message="already absent")

    failure = slots_ctx.git.delete_local_branch(target.branch_name, force=True)
    if failure is not None:
        if _is_missing_local_branch_failure(failure.message, target.branch_name):
            return _cleanup_result(target, "local_branch", "skipped", message="already absent")
        return _cleanup_result(target, "local_branch", "error", message=failure.message)
    return _cleanup_result(target, "local_branch", "success")


def _is_missing_local_branch_failure(message: str, branch: str) -> bool:
    lowered = message.lower()
    quoted = f"branch '{branch.lower()}' not found"
    return quoted in lowered


def _cleanup_result(
    target: FreedSlot,
    action: SlotFreeCleanupAction,
    status: SlotFreeCleanupStatus,
    *,
    pr_number: int | None = None,
    message: str | None = None,
) -> SlotFreeCleanupResult:
    return SlotFreeCleanupResult(
        slot_name=target.slot_name,
        branch_name=target.branch_name,
        action=action,
        status=status,
        pr_number=pr_number,
        message=message,
    )


def _pr_failure_message(failure: PRGatewayFailure) -> str:
    return failure.stderr or failure.stdout or f"gh exited {failure.returncode}"


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
        if slots_ctx.git.has_uncommitted_changes(record.path):
            errors.append(
                f"{slot_name} has uncommitted changes at {record.path}. "
                f"Commit or stash before freeing."
            )
    return tuple(errors)


def _partial_failure_message(base: str, freed: list[FreedSlot]) -> str:
    if not freed:
        return base
    already = ", ".join(f.slot_name for f in freed)
    return f"{base} Already freed: {already}."
