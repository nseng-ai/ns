"""Garbage collection: free slots whose PRs have merged or closed."""

from __future__ import annotations

import dataclasses
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass

from asdl_core.gh.types import PRLookupError, PRSummary
from asdl_slots.context import SlotsCliContext
from asdl_slots.inventory import SlotRecord, build_slot_inventory
from asdl_slots.lifecycle.outcomes import (
    SlotGcAction,
    SlotGcEntry,
    SlotGcOutcome,
    SlotGcPlan,
    SlotLifecycleFailure,
)


@dataclass(frozen=True)
class _GcCounts:
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int


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


def _with_action(
    entry: SlotGcEntry,
    action: SlotGcAction,
    *,
    message: str | None = None,
) -> SlotGcEntry:
    return dataclasses.replace(entry, action=action, message=message)


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
        elif entry.action == "skipped_dirty":
            skipped += 1
        elif entry.action == "error":
            error += 1
    return _GcCounts(
        freed_count=freed,
        kept_count=kept,
        skipped_count=skipped,
        error_count=error,
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
        pr_result = slots_ctx.pr.get_pr_for_branch(record.branch)

        if isinstance(pr_result, PRLookupError):
            if pr_result.returncode == 1:
                entries.append(_entry_from_record(record, "kept_no_pr"))
                continue
            entries.append(
                _entry_from_record(
                    record,
                    "error",
                    message=pr_result.stderr or f"gh pr view exited {pr_result.returncode}",
                )
            )
            continue

        if pr_result.state == "OPEN":
            entries.append(_entry_from_record(record, "kept_open_pr", pr_result=pr_result))
            continue

        entries.append(_entry_from_record(record, "would_free", pr_result=pr_result))
        would_free_count += 1

    return SlotGcPlan(entries=tuple(entries), would_free_count=would_free_count)


def execute_gc_plan(slots_ctx: SlotsCliContext, plan: SlotGcPlan) -> SlotGcOutcome:
    """Free every ``would_free`` entry in ``plan``; pass through the rest."""
    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    trunk = slots_ctx.git.get_trunk_branch()
    entries: list[SlotGcEntry] = []

    for entry in plan.entries:
        if entry.action != "would_free":
            entries.append(entry)
            continue

        record = inventory.find_by_slot(entry.slot_name)
        if record is None or record.branch is None:
            entries.append(
                _with_action(
                    entry,
                    "error",
                    message=(
                        f"slot {entry.slot_name} was not assigned during free "
                        f"(state changed between plan and execute)."
                    ),
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

        entries.append(_with_action(entry, "freed"))

    counts = _count_gc_actions(entries)
    return SlotGcOutcome(
        entries=tuple(entries),
        freed_count=counts.freed_count,
        kept_count=counts.kept_count,
        skipped_count=counts.skipped_count,
        error_count=counts.error_count,
        dry_run=False,
    )


def outcome_from_gc_plan(plan: SlotGcPlan, *, dry_run: bool) -> SlotGcOutcome:
    """Turn a GC plan into a non-mutating outcome."""
    counts = _count_gc_actions(plan.entries)
    return SlotGcOutcome(
        entries=plan.entries,
        freed_count=counts.freed_count,
        kept_count=counts.kept_count,
        skipped_count=counts.skipped_count,
        error_count=counts.error_count,
        dry_run=dry_run,
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
