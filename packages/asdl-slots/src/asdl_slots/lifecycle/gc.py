"""Garbage collection: free slots whose PRs have merged or closed."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from asdl_slots.context import SlotsCliContext
from asdl_slots.lifecycle.outcomes import (
    SlotFreeCleanupAction,
    SlotFreeCleanupResult,
    SlotGcOutcome,
    SlotGcPlan,
    SlotLifecycleFailure,
)
from asdl_slots.lifecycle.release import SlotReleaseWorkflow


@dataclass(frozen=True)
class SlotGcReleasePreview:
    plan: SlotGcPlan
    outcome: SlotGcOutcome


def plan_gc(slots_ctx: SlotsCliContext) -> SlotGcPlan | SlotLifecycleFailure:
    """Classify assigned slots for garbage collection without mutating state."""
    return SlotReleaseWorkflow(slots_ctx).plan_gc()


def plan_gc_cleanup(
    slots_ctx: SlotsCliContext,
    plan: SlotGcPlan,
    cleanup_actions: Sequence[SlotFreeCleanupAction],
) -> tuple[SlotFreeCleanupResult, ...]:
    """Plan GC cleanup without freeing slots or deleting local branches."""
    return SlotReleaseWorkflow(slots_ctx).plan_gc_cleanup(plan, cleanup_actions)


def execute_gc_plan(
    slots_ctx: SlotsCliContext,
    plan: SlotGcPlan,
    *,
    cleanup_actions: Sequence[SlotFreeCleanupAction] = (),
) -> SlotGcOutcome:
    """Free every ``would_free`` entry in ``plan``; pass through the rest."""
    return SlotReleaseWorkflow(slots_ctx).execute_gc_plan(
        plan,
        cleanup_actions=cleanup_actions,
    )


def outcome_from_gc_release_plan(
    slots_ctx: SlotsCliContext,
    plan: SlotGcPlan,
    cleanup_actions: Sequence[SlotFreeCleanupAction] = (),
) -> SlotGcOutcome:
    """Compose a dry-run GC release outcome from an existing classification plan."""
    cleanup = plan_gc_cleanup(slots_ctx, plan, cleanup_actions)
    return outcome_from_gc_plan(plan, dry_run=True, cleanup=cleanup)


def plan_gc_release_preview(
    slots_ctx: SlotsCliContext,
    cleanup_actions: Sequence[SlotFreeCleanupAction] = (),
) -> SlotGcReleasePreview | SlotLifecycleFailure:
    """Classify GC candidates and attach release cleanup preview without mutating state."""
    plan = plan_gc(slots_ctx)
    if isinstance(plan, SlotLifecycleFailure):
        return plan
    return SlotGcReleasePreview(
        plan=plan,
        outcome=outcome_from_gc_release_plan(slots_ctx, plan, cleanup_actions),
    )


def outcome_from_gc_plan(
    plan: SlotGcPlan,
    *,
    dry_run: bool,
    cleanup: Sequence[SlotFreeCleanupResult] = (),
) -> SlotGcOutcome:
    """Turn a GC plan and precomputed cleanup results into a renderable outcome."""
    return SlotReleaseWorkflow.outcome_from_gc_plan(
        plan,
        dry_run=dry_run,
        cleanup=cleanup,
    )


def garbage_collect_slots(
    slots_ctx: SlotsCliContext,
    *,
    dry_run: bool,
) -> SlotGcOutcome | SlotLifecycleFailure:
    """Plan the GC sweep and execute it unless ``dry_run`` is true."""
    return SlotReleaseWorkflow(slots_ctx).garbage_collect_slots(dry_run=dry_run)
