"""Slot garbage collection: free slots whose PR has merged or closed.

``run_gc`` sweeps every assignment in the pool, classifies it via
``ctx.pr.get_pr_for_branch``, and for MERGED/CLOSED PRs delegates to
``free_slot_assignment`` so the slot returns to the placeholder state
(no assignment, worktree retained).

The sweep is split into two phases:

* :func:`plan_gc` classifies every assignment and returns a
  :class:`SlotGcPlan` without mutating state. This lets callers preview
  the proposed actions before committing to them.
* :func:`execute_gc_plan` takes a plan and frees every ``would_free``
  entry, translating ``free_slot_assignment`` outcomes into terminal
  actions (``freed``/``skipped_dirty``/``error``).

:func:`run_gc` remains as a thin wrapper that plans and (unless
``dry_run`` is true) executes.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from twerk_core.gh.types import PRLookupError, PRState
from twerk_slots.allocation import (
    DirtyWorktreeError,
    SlotFreeOutcome,
    SlotNotAssignedError,
    free_slot_assignment,
    sync_pool_assignments,
)
from twerk_slots.context import SlotsCliContext

SlotGcAction = Literal[
    "freed",
    "would_free",
    "kept_open_pr",
    "kept_no_pr",
    "skipped_dirty",
    "error",
]


@dataclass(frozen=True)
class SlotGcEntry:
    """Per-slot outcome of a gc sweep."""

    slot_name: str
    branch_name: str
    worktree_path: Path
    action: SlotGcAction
    pr_number: int | None
    pr_state: PRState | None
    pr_url: str | None
    message: str | None


@dataclass(frozen=True)
class SlotGcPlan:
    """Pre-execution classification produced by :func:`plan_gc`."""

    entries: tuple[SlotGcEntry, ...]
    would_free_count: int


@dataclass(frozen=True)
class SlotGcOutcome:
    """Aggregate outcome of ``run_gc``."""

    entries: tuple[SlotGcEntry, ...]
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int
    dry_run: bool


def plan_gc(ctx: SlotsCliContext) -> SlotGcPlan:
    """Classify every assignment without mutating slot state.

    MERGED/CLOSED PRs become ``would_free`` entries. Everything else is
    classified with its terminal action (``kept_open_pr``/``kept_no_pr``/
    ``error``) since those branches never mutate state anyway.
    """
    state = ctx.pool_state.load()
    state = sync_pool_assignments(state, ctx.git, ctx.storage, ctx.pool_state)

    entries: list[SlotGcEntry] = []
    would_free_count = 0

    for assignment in state.assignments:
        pr_result = ctx.pr.get_pr_for_branch(assignment.branch_name)

        if isinstance(pr_result, PRLookupError):
            if pr_result.returncode == 1:
                entries.append(
                    SlotGcEntry(
                        slot_name=assignment.slot_name,
                        branch_name=assignment.branch_name,
                        worktree_path=assignment.worktree_path,
                        action="kept_no_pr",
                        pr_number=None,
                        pr_state=None,
                        pr_url=None,
                        message=None,
                    )
                )
                continue
            entries.append(
                SlotGcEntry(
                    slot_name=assignment.slot_name,
                    branch_name=assignment.branch_name,
                    worktree_path=assignment.worktree_path,
                    action="error",
                    pr_number=None,
                    pr_state=None,
                    pr_url=None,
                    message=pr_result.stderr or f"gh pr view exited {pr_result.returncode}",
                )
            )
            continue

        if pr_result.state == "OPEN":
            entries.append(
                SlotGcEntry(
                    slot_name=assignment.slot_name,
                    branch_name=assignment.branch_name,
                    worktree_path=assignment.worktree_path,
                    action="kept_open_pr",
                    pr_number=pr_result.number,
                    pr_state=pr_result.state,
                    pr_url=pr_result.url,
                    message=None,
                )
            )
            continue

        entries.append(
            SlotGcEntry(
                slot_name=assignment.slot_name,
                branch_name=assignment.branch_name,
                worktree_path=assignment.worktree_path,
                action="would_free",
                pr_number=pr_result.number,
                pr_state=pr_result.state,
                pr_url=pr_result.url,
                message=None,
            )
        )
        would_free_count += 1

    return SlotGcPlan(entries=tuple(entries), would_free_count=would_free_count)


def execute_gc_plan(ctx: SlotsCliContext, plan: SlotGcPlan) -> SlotGcOutcome:
    """Free every ``would_free`` entry in ``plan``; passthrough the rest."""
    entries: list[SlotGcEntry] = []
    freed_count = 0
    kept_count = 0
    skipped_count = 0
    error_count = 0

    for entry in plan.entries:
        if entry.action != "would_free":
            entries.append(entry)
            if entry.action in ("kept_open_pr", "kept_no_pr"):
                kept_count += 1
            elif entry.action == "skipped_dirty":
                skipped_count += 1
            elif entry.action == "error":
                error_count += 1
            elif entry.action == "freed":
                freed_count += 1
            continue

        free_result = free_slot_assignment(ctx, slot_name=entry.slot_name)
        if isinstance(free_result, SlotFreeOutcome):
            entries.append(
                SlotGcEntry(
                    slot_name=entry.slot_name,
                    branch_name=entry.branch_name,
                    worktree_path=entry.worktree_path,
                    action="freed",
                    pr_number=entry.pr_number,
                    pr_state=entry.pr_state,
                    pr_url=entry.pr_url,
                    message=None,
                )
            )
            freed_count += 1
            continue
        if isinstance(free_result, DirtyWorktreeError):
            entries.append(
                SlotGcEntry(
                    slot_name=entry.slot_name,
                    branch_name=entry.branch_name,
                    worktree_path=entry.worktree_path,
                    action="skipped_dirty",
                    pr_number=entry.pr_number,
                    pr_state=entry.pr_state,
                    pr_url=entry.pr_url,
                    message=(f"worktree has uncommitted changes at {free_result.worktree_path}"),
                )
            )
            skipped_count += 1
            continue
        # SlotNotAssignedError shouldn't happen — we iterate live assignments —
        # but handle defensively so a transient race doesn't abort the sweep.
        assert isinstance(free_result, SlotNotAssignedError)
        entries.append(
            SlotGcEntry(
                slot_name=entry.slot_name,
                branch_name=entry.branch_name,
                worktree_path=entry.worktree_path,
                action="error",
                pr_number=entry.pr_number,
                pr_state=entry.pr_state,
                pr_url=entry.pr_url,
                message=f"slot {entry.slot_name} was not assigned during free",
            )
        )
        error_count += 1

    return SlotGcOutcome(
        entries=tuple(entries),
        freed_count=freed_count,
        kept_count=kept_count,
        skipped_count=skipped_count,
        error_count=error_count,
        dry_run=False,
    )


def outcome_from_plan(plan: SlotGcPlan, *, dry_run: bool) -> SlotGcOutcome:
    """Turn a plan into an outcome without executing it.

    Used for dry-run reporting and for cancelled interactive runs. Every
    ``would_free`` entry counts toward ``freed_count`` (preserving the
    existing dry-run tally semantics).
    """
    freed_count = 0
    kept_count = 0
    skipped_count = 0
    error_count = 0
    for entry in plan.entries:
        if entry.action == "would_free":
            freed_count += 1
        elif entry.action in ("kept_open_pr", "kept_no_pr"):
            kept_count += 1
        elif entry.action == "skipped_dirty":
            skipped_count += 1
        elif entry.action == "error":
            error_count += 1
        elif entry.action == "freed":
            freed_count += 1
    return SlotGcOutcome(
        entries=plan.entries,
        freed_count=freed_count,
        kept_count=kept_count,
        skipped_count=skipped_count,
        error_count=error_count,
        dry_run=dry_run,
    )


def run_gc(ctx: SlotsCliContext, *, dry_run: bool) -> SlotGcOutcome:
    """Plan the sweep and (unless ``dry_run``) execute it.

    Classification rules (see :func:`plan_gc`):
      * OPEN PR → ``kept_open_pr``.
      * MERGED or CLOSED PR → ``freed`` (or ``would_free`` in dry-run).
      * No PR found (``gh pr view`` returncode 1) → ``kept_no_pr``.
      * ``gh`` broken (other non-zero returncodes) → ``error``; sweep continues.
      * Dirty worktree intercepts a free and becomes ``skipped_dirty``.
    """
    plan = plan_gc(ctx)
    if dry_run:
        return outcome_from_plan(plan, dry_run=True)
    return execute_gc_plan(ctx, plan)
