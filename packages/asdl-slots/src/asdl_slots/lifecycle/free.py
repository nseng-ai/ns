"""Compatibility wrappers for releasing assigned slots back to the pool."""

from __future__ import annotations

from collections.abc import Sequence

from asdl_slots.context import SlotsCliContext
from asdl_slots.lifecycle import release
from asdl_slots.lifecycle.outcomes import (
    FreedSlot,
    SlotFreeCleanupAction,
    SlotFreeCleanupResult,
    SlotFreeOutcome,
    SlotFreePlan,
    SlotLifecycleFailure,
)

SLOT_FREE_ALL_CLEANUP_ACTIONS = release.SLOT_FREE_ALL_CLEANUP_ACTIONS


def plan_free_slots(
    slots_ctx: SlotsCliContext,
    slot_names: Sequence[str],
    *,
    preflight_errors: Sequence[str] = (),
    trunk_branch: str | None = None,
) -> SlotFreePlan | SlotLifecycleFailure:
    """Validate selected slots and return the free plan without mutating state."""
    return release.plan_free_slots(
        slots_ctx,
        slot_names,
        preflight_errors=preflight_errors,
        trunk_branch=trunk_branch,
    )


def execute_free_plan(
    slots_ctx: SlotsCliContext,
    plan: SlotFreePlan,
) -> SlotFreeOutcome | SlotLifecycleFailure:
    """Detach every target in ``plan``."""
    return release.execute_free_plan(slots_ctx, plan)


def free_slots(
    slots_ctx: SlotsCliContext,
    slot_names: Sequence[str],
    *,
    preflight_errors: Sequence[str] = (),
    trunk_branch: str | None = None,
) -> SlotFreeOutcome | SlotLifecycleFailure:
    return release.free_slots(
        slots_ctx,
        slot_names,
        preflight_errors=preflight_errors,
        trunk_branch=trunk_branch,
    )


def plan_cleanup_for_free_targets(
    slots_ctx: SlotsCliContext,
    targets: Sequence[FreedSlot],
    cleanup_actions: Sequence[SlotFreeCleanupAction],
    *,
    trunk_branch: str | None = None,
) -> tuple[SlotFreeCleanupResult, ...]:
    """Plan cleanup entries for free targets without mutating PRs or branches."""
    return release.plan_cleanup_for_free_targets(
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
    return release.execute_cleanup_for_freed_slots(
        slots_ctx,
        freed,
        cleanup_actions,
        trunk_branch=trunk_branch,
    )
