"""Slot garbage collection: free slots whose PR has merged or closed.

``run_gc`` sweeps every assignment in the pool, classifies it via
``ctx.pr.get_pr_for_branch``, and for MERGED/CLOSED PRs delegates to
``free_slot_assignment`` so the slot returns to the placeholder state
(no assignment, worktree retained).
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
class SlotGcOutcome:
    """Aggregate outcome of ``run_gc``."""

    entries: tuple[SlotGcEntry, ...]
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int
    dry_run: bool


def run_gc(ctx: SlotsCliContext, *, dry_run: bool) -> SlotGcOutcome:
    """Sweep every assignment; free those with MERGED or CLOSED PRs.

    Classification rules:
      * OPEN PR → ``kept_open_pr``.
      * MERGED or CLOSED PR → ``freed`` (or ``would_free`` in dry-run).
      * No PR found (``gh pr view`` returncode 1) → ``kept_no_pr``.
      * ``gh`` broken (other non-zero returncodes) → ``error``; sweep continues.
      * Dirty worktree intercepts a free and becomes ``skipped_dirty``.
    """
    state = ctx.pool_state.load()
    state = sync_pool_assignments(state, ctx.git, ctx.storage, ctx.pool_state)

    entries: list[SlotGcEntry] = []
    freed_count = 0
    kept_count = 0
    skipped_count = 0
    error_count = 0

    # Snapshot assignments before sweeping — free_slot_assignment mutates state
    # via ctx.pool_state.save(...).
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
                kept_count += 1
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
            error_count += 1
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
            kept_count += 1
            continue

        if dry_run:
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
            freed_count += 1
            continue

        free_result = free_slot_assignment(ctx, slot_name=assignment.slot_name)
        if isinstance(free_result, SlotFreeOutcome):
            entries.append(
                SlotGcEntry(
                    slot_name=assignment.slot_name,
                    branch_name=assignment.branch_name,
                    worktree_path=assignment.worktree_path,
                    action="freed",
                    pr_number=pr_result.number,
                    pr_state=pr_result.state,
                    pr_url=pr_result.url,
                    message=None,
                )
            )
            freed_count += 1
            continue
        if isinstance(free_result, DirtyWorktreeError):
            entries.append(
                SlotGcEntry(
                    slot_name=assignment.slot_name,
                    branch_name=assignment.branch_name,
                    worktree_path=assignment.worktree_path,
                    action="skipped_dirty",
                    pr_number=pr_result.number,
                    pr_state=pr_result.state,
                    pr_url=pr_result.url,
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
                slot_name=assignment.slot_name,
                branch_name=assignment.branch_name,
                worktree_path=assignment.worktree_path,
                action="error",
                pr_number=pr_result.number,
                pr_state=pr_result.state,
                pr_url=pr_result.url,
                message=f"slot {assignment.slot_name} was not assigned during free",
            )
        )
        error_count += 1

    return SlotGcOutcome(
        entries=tuple(entries),
        freed_count=freed_count,
        kept_count=kept_count,
        skipped_count=skipped_count,
        error_count=error_count,
        dry_run=dry_run,
    )
