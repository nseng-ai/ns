"""Release workflow for freeing and garbage-collecting managed slots."""

from __future__ import annotations

import dataclasses
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass

from asdl_core.gh.types import PRGatewayFailure, PRLookupMiss, PRSummary
from asdl_slots.context import SlotsCliContext
from asdl_slots.inventory import SlotInventory, SlotRecord, build_slot_inventory
from asdl_slots.lifecycle.operation_state import (
    operation_in_progress_detail,
    slot_operation_in_progress_message,
)
from asdl_slots.lifecycle.outcomes import (
    FreedSlot,
    SlotFreeCleanupAction,
    SlotFreeCleanupResult,
    SlotFreeCleanupStatus,
    SlotFreeOutcome,
    SlotFreePlan,
    SlotGcAction,
    SlotGcEntry,
    SlotGcOutcome,
    SlotGcPlan,
    SlotLifecycleFailure,
)

SLOT_FREE_ALL_CLEANUP_ACTIONS: tuple[SlotFreeCleanupAction, ...] = (
    "pr",
    "local_branch",
)


@dataclass(frozen=True)
class _GcCounts:
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int


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
        if record.operation is not None:
            return SlotLifecycleFailure(
                error_type="operation_in_progress",
                message=slot_operation_in_progress_message(
                    slot_name=record.slot_name,
                    branch_name=record.branch,
                    worktree_path=record.path,
                    operation=record.operation,
                    action="freeing",
                ),
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
        if record.operation is not None:
            return SlotLifecycleFailure(
                error_type="operation_in_progress",
                message=_partial_failure_message(
                    slot_operation_in_progress_message(
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


def plan_gc(slots_ctx: SlotsCliContext) -> SlotGcPlan | SlotLifecycleFailure:
    """Classify assigned slots for garbage collection without mutating state."""
    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    if inventory.pool_size == 0:
        return _gc_pool_empty_failure()

    entries: list[SlotGcEntry] = []
    would_free_count = 0

    for record in inventory.records:
        if record.branch is None:
            continue
        if record.operation is not None:
            entries.append(
                _entry_from_record(
                    record,
                    "skipped_operation",
                    message=_operation_in_progress_message(record, action="running slot gc"),
                )
            )
            continue
        pr_result = slots_ctx.pr.get_pr_for_branch(record.branch)

        if isinstance(pr_result, PRLookupMiss):
            entries.append(_entry_from_record(record, "kept_no_pr"))
            continue

        if isinstance(pr_result, PRGatewayFailure):
            entries.append(
                _entry_from_record(
                    record,
                    "error",
                    message=(
                        pr_result.stderr
                        or pr_result.stdout
                        or f"gh pr view exited {pr_result.returncode}"
                    ),
                )
            )
            continue

        if pr_result.state == "OPEN":
            entries.append(_entry_from_record(record, "kept_open_pr", pr_result=pr_result))
            continue

        entries.append(_entry_from_record(record, "would_free", pr_result=pr_result))
        would_free_count += 1

    return SlotGcPlan(entries=tuple(entries), would_free_count=would_free_count)


def plan_gc_cleanup(
    slots_ctx: SlotsCliContext,
    plan: SlotGcPlan,
    cleanup_actions: Sequence[SlotFreeCleanupAction],
) -> tuple[SlotFreeCleanupResult, ...]:
    """Plan GC cleanup without freeing slots or deleting local branches."""
    targets = _gc_free_targets(plan.entries)
    if not targets or not cleanup_actions:
        return ()
    trunk_branch = slots_ctx.git.get_trunk_branch()
    return plan_cleanup_for_free_targets(
        slots_ctx,
        targets,
        cleanup_actions,
        trunk_branch=trunk_branch,
    )


def execute_gc_plan(
    slots_ctx: SlotsCliContext,
    plan: SlotGcPlan,
    *,
    cleanup_actions: Sequence[SlotFreeCleanupAction] = (),
) -> SlotGcOutcome:
    """Free every ``would_free`` entry in ``plan``; pass through the rest."""
    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    trunk = slots_ctx.git.get_trunk_branch()
    entries: list[SlotGcEntry] = []
    freed_entries: list[SlotGcEntry] = []

    for entry in plan.entries:
        if entry.action != "would_free":
            entries.append(entry)
            continue

        record = inventory.find_by_slot(entry.slot_name)
        if record is None or record.branch is None or record.branch != entry.branch_name:
            entries.append(
                _with_action(
                    entry,
                    "error",
                    message=(
                        f"slot {entry.slot_name} was not assigned to {entry.branch_name} during "
                        f"free (state changed between plan and execute)."
                    ),
                )
            )
            continue

        if record.operation is not None:
            entries.append(
                _with_action(
                    entry,
                    "skipped_operation",
                    message=_operation_in_progress_message(record, action="freeing this slot"),
                )
            )
            continue

        if slots_ctx.git.has_uncommitted_changes(record.path):
            entries.append(
                _with_action(
                    entry,
                    "skipped_dirty",
                    message=f"worktree has uncommitted changes at {record.path}",
                )
            )
            continue

        try:
            slots_ctx.git.detach_head(record.path, trunk)
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else str(exc)
            entries.append(
                _with_action(
                    entry,
                    "error",
                    message=(
                        f"Failed to detach {entry.slot_name} at {record.path} to {trunk}: {stderr}"
                    ),
                )
            )
            continue

        freed_entry = _with_action(entry, "freed")
        entries.append(freed_entry)
        freed_entries.append(freed_entry)

    if cleanup_actions and freed_entries:
        cleanup = execute_cleanup_for_freed_slots(
            slots_ctx,
            _gc_free_targets(freed_entries),
            cleanup_actions,
            trunk_branch=trunk,
        )
        entries = list(_with_cleanup_by_slot(entries, cleanup))

    counts = _count_gc_actions(entries)
    return SlotGcOutcome(
        entries=tuple(entries),
        freed_count=counts.freed_count,
        kept_count=counts.kept_count,
        skipped_count=counts.skipped_count,
        error_count=counts.error_count,
        dry_run=False,
        cleanup_error_count=_cleanup_error_count(entries),
    )


def outcome_from_gc_plan(
    plan: SlotGcPlan,
    *,
    dry_run: bool,
    cleanup: Sequence[SlotFreeCleanupResult] = (),
) -> SlotGcOutcome:
    """Turn a GC plan and precomputed cleanup results into a renderable outcome."""
    entries = _with_cleanup_by_slot(plan.entries, cleanup) if cleanup else plan.entries
    counts = _count_gc_actions(entries)
    return SlotGcOutcome(
        entries=entries,
        freed_count=counts.freed_count,
        kept_count=counts.kept_count,
        skipped_count=counts.skipped_count,
        error_count=counts.error_count,
        dry_run=dry_run,
        cleanup_error_count=_cleanup_error_count(entries),
    )


def garbage_collect_slots(
    slots_ctx: SlotsCliContext,
    *,
    dry_run: bool,
) -> SlotGcOutcome | SlotLifecycleFailure:
    """Plan the GC sweep and execute it unless ``dry_run`` is true."""
    plan = plan_gc(slots_ctx)
    if isinstance(plan, SlotLifecycleFailure):
        return plan
    if dry_run:
        return outcome_from_gc_plan(plan, dry_run=True)
    return execute_gc_plan(slots_ctx, plan)


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
    return tuple(errors)


def _partial_failure_message(base: str, freed: list[FreedSlot]) -> str:
    if not freed:
        return base
    already = ", ".join(f.slot_name for f in freed)
    return f"{base} Already freed: {already}."


def _gc_pool_empty_failure() -> SlotLifecycleFailure:
    return SlotLifecycleFailure(
        error_type="pool_empty",
        message="No managed slots configured. Run `slot init --size N` first.",
    )


def _operation_in_progress_message(record: SlotRecord, *, action: str) -> str:
    assert record.operation is not None
    return operation_in_progress_detail(
        branch_name=record.branch,
        worktree_path=record.path,
        operation=record.operation,
        action=action,
    )


def _entry_from_record(
    record: SlotRecord,
    action: SlotGcAction,
    *,
    pr_result: PRSummary | None = None,
    message: str | None = None,
) -> SlotGcEntry:
    assert record.branch is not None
    return SlotGcEntry(
        slot_name=record.slot_name,
        branch_name=record.branch,
        worktree_path=record.path,
        action=action,
        pr_number=pr_result.number if pr_result is not None else None,
        pr_state=pr_result.state if pr_result is not None else None,
        pr_url=pr_result.url if pr_result is not None else None,
        message=message,
    )


def _with_action(
    entry: SlotGcEntry,
    action: SlotGcAction,
    *,
    message: str | None = None,
) -> SlotGcEntry:
    return dataclasses.replace(entry, action=action, message=message)


def _with_cleanup(
    entry: SlotGcEntry,
    cleanup: Sequence[SlotFreeCleanupResult],
) -> SlotGcEntry:
    return dataclasses.replace(entry, cleanup=tuple(cleanup))


def _freed_slot_from_gc_entry(entry: SlotGcEntry) -> FreedSlot:
    return FreedSlot(
        slot_name=entry.slot_name,
        branch_name=entry.branch_name,
        worktree_path=entry.worktree_path,
    )


def _gc_free_targets(entries: Sequence[SlotGcEntry]) -> tuple[FreedSlot, ...]:
    return tuple(
        _freed_slot_from_gc_entry(entry)
        for entry in entries
        if entry.action in ("would_free", "freed")
    )


def _with_cleanup_by_slot(
    entries: Sequence[SlotGcEntry],
    cleanup: Sequence[SlotFreeCleanupResult],
) -> tuple[SlotGcEntry, ...]:
    cleanup_by_target: dict[tuple[str, str], list[SlotFreeCleanupResult]] = {}
    for result in cleanup:
        cleanup_by_target.setdefault((result.slot_name, result.branch_name), []).append(result)
    return tuple(
        _with_cleanup(entry, cleanup_by_target.get((entry.slot_name, entry.branch_name), ()))
        for entry in entries
    )


def _cleanup_error_count(entries: Sequence[SlotGcEntry]) -> int:
    return sum(1 for entry in entries for cleanup in entry.cleanup if cleanup.status == "error")


def _count_gc_actions(entries: Sequence[SlotGcEntry]) -> _GcCounts:
    freed = 0
    kept = 0
    skipped = 0
    error = 0
    for entry in entries:
        if entry.action in ("freed", "would_free"):
            freed += 1
        elif entry.action in ("kept_open_pr", "kept_no_pr"):
            kept += 1
        elif entry.action in ("skipped_dirty", "skipped_operation"):
            skipped += 1
        elif entry.action == "error":
            error += 1
    return _GcCounts(
        freed_count=freed,
        kept_count=kept,
        skipped_count=skipped,
        error_count=error,
    )
