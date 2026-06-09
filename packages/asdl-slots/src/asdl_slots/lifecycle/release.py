"""Presentation-neutral release workflows for freeing slot assignments."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from asdl_slots.context import SlotsCliContext
from asdl_slots.lifecycle.free import execute_free_plan, plan_free_slots
from asdl_slots.lifecycle.gc import (
    execute_gc_plan,
    outcome_from_gc_plan,
    plan_gc,
    plan_gc_cleanup,
)
from asdl_slots.lifecycle.outcomes import (
    SlotFreeCleanupAction,
    SlotFreeCleanupResult,
    SlotFreeOutcome,
    SlotFreePlan,
    SlotGcOutcome,
    SlotGcPlan,
    SlotLifecycleFailure,
)
from asdl_slots.lifecycle.release_cleanup import (
    execute_release_cleanup,
    plan_release_cleanup,
)


@dataclass(frozen=True)
class SlotFreeReleasePreview:
    plan: SlotFreePlan
    cleanup: tuple[SlotFreeCleanupResult, ...]


@dataclass(frozen=True)
class SlotFreeReleaseExecution:
    outcome: SlotFreeOutcome
    cleanup: tuple[SlotFreeCleanupResult, ...]


@dataclass(frozen=True)
class SlotGcReleasePreview:
    plan: SlotGcPlan
    cleanup: tuple[SlotFreeCleanupResult, ...]
    outcome: SlotGcOutcome


def plan_free_release(
    slots_ctx: SlotsCliContext,
    slot_names: Sequence[str],
    *,
    preflight_errors: Sequence[str] = (),
    cleanup_actions: Sequence[SlotFreeCleanupAction] = (),
) -> SlotFreeReleasePreview | SlotLifecycleFailure:
    """Plan a slot free operation and any requested release cleanup."""
    plan = plan_free_slots(
        slots_ctx,
        slot_names,
        preflight_errors=preflight_errors,
    )
    if isinstance(plan, SlotLifecycleFailure):
        return plan

    cleanup = plan_release_cleanup(
        slots_ctx,
        plan.targets,
        cleanup_actions,
        trunk_branch=plan.trunk_branch,
    )
    return SlotFreeReleasePreview(plan=plan, cleanup=cleanup)


def execute_free_release(
    slots_ctx: SlotsCliContext,
    preview: SlotFreeReleasePreview,
    *,
    cleanup_actions: Sequence[SlotFreeCleanupAction] = (),
) -> SlotFreeReleaseExecution | SlotLifecycleFailure:
    """Execute a planned slot free operation and its requested cleanup."""
    outcome = execute_free_plan(slots_ctx, preview.plan)
    if isinstance(outcome, SlotLifecycleFailure):
        return outcome

    cleanup = execute_release_cleanup(
        slots_ctx,
        outcome.freed,
        cleanup_actions,
        trunk_branch=preview.plan.trunk_branch,
    )
    return SlotFreeReleaseExecution(outcome=outcome, cleanup=cleanup)


def plan_gc_release(
    slots_ctx: SlotsCliContext,
    *,
    cleanup_actions: Sequence[SlotFreeCleanupAction] = (),
) -> SlotGcReleasePreview | SlotLifecycleFailure:
    """Plan a GC sweep and preview any requested cleanup without mutating state."""
    plan = plan_gc(slots_ctx)
    if isinstance(plan, SlotLifecycleFailure):
        return plan

    cleanup = plan_gc_cleanup(slots_ctx, plan, cleanup_actions)
    outcome = outcome_from_gc_plan(plan, dry_run=True, cleanup=cleanup)
    return SlotGcReleasePreview(plan=plan, cleanup=cleanup, outcome=outcome)


def execute_gc_release(
    slots_ctx: SlotsCliContext,
    preview: SlotGcReleasePreview,
    *,
    cleanup_actions: Sequence[SlotFreeCleanupAction] = (),
) -> SlotGcOutcome:
    """Execute a planned GC sweep, preserving execute-time recheck semantics."""
    return execute_gc_plan(slots_ctx, preview.plan, cleanup_actions=cleanup_actions)


def outcome_from_gc_release_preview(
    preview: SlotGcReleasePreview,
    *,
    dry_run: bool,
) -> SlotGcOutcome:
    """Build a GC outcome from a release preview without executing the sweep."""
    if dry_run:
        return preview.outcome
    return outcome_from_gc_plan(preview.plan, dry_run=False, cleanup=preview.cleanup)
