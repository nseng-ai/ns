"""Garbage collection: free slots whose PRs have merged or closed."""

from __future__ import annotations

import dataclasses
from collections.abc import Sequence
from dataclasses import dataclass

from asdl_core.gh.types import PRGatewayFailure, PRLookupMiss, PRSummary
from asdl_slots.context import SlotsCliContext
from asdl_slots.inventory import SlotRecord, build_slot_inventory
from asdl_slots.lifecycle.operation_state import (
    operation_in_progress_detail,
    slot_operation_in_progress_message,
)
from asdl_slots.lifecycle.outcomes import (
    FreedSlot,
    SlotFreeCleanupAction,
    SlotFreeCleanupResult,
    SlotGcAction,
    SlotGcEntry,
    SlotGcOutcome,
    SlotGcPlan,
    SlotLifecycleFailure,
)
from asdl_slots.lifecycle.release_cleanup import (
    execute_release_cleanup,
    plan_release_cleanup,
)
from asdl_slots.lifecycle.release_target import (
    ReleaseTargetFailure,
    release_assigned_slot_target,
)


@dataclass(frozen=True)
class _GcCounts:
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int


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
                    message=operation_in_progress_detail(
                        branch_name=record.branch,
                        worktree_path=record.path,
                        operation=record.operation,
                        action="running slot gc",
                    ),
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
    return plan_release_cleanup(slots_ctx, targets, cleanup_actions, trunk_branch=trunk_branch)


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

        target = _freed_slot_from_gc_entry(entry)
        result = release_assigned_slot_target(
            slots_ctx.git,
            inventory,
            target,
            trunk,
        )
        if isinstance(result, ReleaseTargetFailure):
            entries.append(_entry_from_release_failure(entry, result))
            continue

        freed_entry = _with_action(entry, "freed")
        entries.append(freed_entry)
        freed_entries.append(freed_entry)

    if cleanup_actions and freed_entries:
        cleanup = execute_release_cleanup(
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
        cleanup_error_count=_gc_cleanup_error_count(entries),
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
        cleanup_error_count=_gc_cleanup_error_count(entries),
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


def _gc_pool_empty_failure() -> SlotLifecycleFailure:
    return SlotLifecycleFailure(
        error_type="pool_empty",
        message="No managed slots configured. Run `slot init --size N` first.",
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


def _entry_from_release_failure(
    entry: SlotGcEntry,
    failure: ReleaseTargetFailure,
) -> SlotGcEntry:
    if failure.reason == "slot_not_assigned":
        return _with_action(
            entry,
            "error",
            message=(
                f"slot {entry.slot_name} was not assigned to {entry.branch_name} "
                "during free (state changed between plan and execute)."
            ),
        )
    if failure.reason == "operation_in_progress":
        return _with_action(
            entry,
            "skipped_operation",
            message=slot_operation_in_progress_message(
                slot_name=failure.slot_name,
                branch_name=failure.branch_name,
                worktree_path=failure.worktree_path,
                operation=failure.operation or "operation",
                action="running slot gc",
            ),
        )
    if failure.reason == "dirty_worktree":
        return _with_action(
            entry,
            "skipped_dirty",
            message=f"worktree has uncommitted changes at {failure.worktree_path}",
        )
    return _with_action(entry, "error", message=_detach_failure_message(failure))


def _detach_failure_message(failure: ReleaseTargetFailure) -> str:
    detach_ref = failure.detach_ref or "target ref"
    detach_error = f": {failure.detach_error}" if failure.detach_error else ""
    return (
        f"Failed to detach {failure.slot_name} at {failure.worktree_path} "
        f"to {detach_ref}{detach_error}"
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


def _gc_cleanup_error_count(entries: Sequence[SlotGcEntry]) -> int:
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
