"""Compatibility wrappers for slot garbage collection release workflow."""

from __future__ import annotations

from collections.abc import Sequence

from asdl_slots.context import SlotsCliContext
from asdl_slots.lifecycle.outcomes import (
    SlotFreeCleanupAction,
    SlotFreeCleanupResult,
    SlotGcOutcome,
    SlotGcPlan,
    SlotLifecycleFailure,
)
from asdl_slots.lifecycle.release import execute_gc_plan as _release_execute_gc_plan
from asdl_slots.lifecycle.release import garbage_collect_slots as _release_garbage_collect_slots
from asdl_slots.lifecycle.release import outcome_from_gc_plan as _release_outcome_from_gc_plan
from asdl_slots.lifecycle.release import plan_gc as _release_plan_gc
from asdl_slots.lifecycle.release import plan_gc_cleanup as _release_plan_gc_cleanup


def plan_gc(slots_ctx: SlotsCliContext) -> SlotGcPlan | SlotLifecycleFailure:
    """Classify assigned slots for garbage collection without mutating state."""
    return _release_plan_gc(slots_ctx)


def plan_gc_cleanup(
    slots_ctx: SlotsCliContext,
    plan: SlotGcPlan,
    cleanup_actions: Sequence[SlotFreeCleanupAction],
) -> tuple[SlotFreeCleanupResult, ...]:
    """Plan GC cleanup without freeing slots or deleting local branches."""
    return _release_plan_gc_cleanup(slots_ctx, plan, cleanup_actions)


def execute_gc_plan(
    slots_ctx: SlotsCliContext,
    plan: SlotGcPlan,
    *,
    cleanup_actions: Sequence[SlotFreeCleanupAction] = (),
) -> SlotGcOutcome:
    """Free every ``would_free`` entry in ``plan``; pass through the rest."""
    return _release_execute_gc_plan(slots_ctx, plan, cleanup_actions=cleanup_actions)


def outcome_from_gc_plan(
    plan: SlotGcPlan,
    *,
    dry_run: bool,
    cleanup: Sequence[SlotFreeCleanupResult] = (),
) -> SlotGcOutcome:
    """Turn a GC plan and precomputed cleanup results into a renderable outcome."""
    return _release_outcome_from_gc_plan(plan, dry_run=dry_run, cleanup=cleanup)


def garbage_collect_slots(
    slots_ctx: SlotsCliContext,
    *,
    dry_run: bool,
) -> SlotGcOutcome | SlotLifecycleFailure:
    """Plan the GC sweep and execute it unless ``dry_run`` is true."""
    return _release_garbage_collect_slots(slots_ctx, dry_run=dry_run)
