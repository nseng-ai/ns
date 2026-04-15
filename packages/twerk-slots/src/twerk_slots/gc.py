"""Best-effort garbage collection for stale slot assignments."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from twerk_core.gh.types import PRLookupError, PRState, PRSummary
from twerk_slots.allocation import (
    DirtyWorktreeError,
    SlotNotAssignedError,
    free_slot_assignment,
    sync_pool_assignments,
)
from twerk_slots.context import SlotsCliContext
from twerk_slots.pool_state import SlotAssignment

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
    entries: tuple[SlotGcEntry, ...]
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int
    dry_run: bool


def _build_entry(
    assignment: SlotAssignment,
    *,
    action: SlotGcAction,
    pr: PRSummary | None = None,
    message: str | None = None,
) -> SlotGcEntry:
    return SlotGcEntry(
        slot_name=assignment.slot_name,
        branch_name=assignment.branch_name,
        worktree_path=assignment.worktree_path,
        action=action,
        pr_number=None if pr is None else pr.number,
        pr_state=None if pr is None else pr.state,
        pr_url=None if pr is None else pr.url,
        message=message,
    )


def _matching_prs(
    assignment: SlotAssignment,
    *,
    local_head: str,
    candidates: tuple[PRSummary, ...],
) -> tuple[PRSummary, ...]:
    return tuple(
        pr
        for pr in candidates
        if pr.head_ref_name == assignment.branch_name and pr.head_ref_oid == local_head
    )


def _summarize_counts(entries: tuple[SlotGcEntry, ...], *, dry_run: bool) -> SlotGcOutcome:
    freed_actions = {"would_free"} if dry_run else {"freed"}
    return SlotGcOutcome(
        entries=entries,
        freed_count=sum(entry.action in freed_actions for entry in entries),
        kept_count=sum(entry.action in {"kept_open_pr", "kept_no_pr"} for entry in entries),
        skipped_count=sum(entry.action == "skipped_dirty" for entry in entries),
        error_count=sum(entry.action == "error" for entry in entries),
        dry_run=dry_run,
    )


def run_gc(
    ctx: SlotsCliContext,
    *,
    dry_run: bool,
) -> SlotGcOutcome:
    """Sweep assigned slots and free the ones backed by closed or merged PRs."""

    state = ctx.pool_state.load()
    if state is None:
        raise AssertionError("run_gc requires an existing pool state")

    state = sync_pool_assignments(state, ctx.git, ctx.storage, ctx.pool_state)

    entries: list[SlotGcEntry] = []
    for assignment in sorted(state.assignments, key=lambda item: item.slot_name):
        if not ctx.storage.path_exists(assignment.worktree_path):
            entries.append(
                _build_entry(
                    assignment,
                    action="error",
                    message=f"Missing worktree path: {assignment.worktree_path}",
                )
            )
            continue

        local_head = ctx.git.get_branch_head_sha(assignment.branch_name)
        if local_head is None:
            entries.append(
                _build_entry(
                    assignment,
                    action="error",
                    message=f"Local branch ref is missing: {assignment.branch_name}",
                )
            )
            continue

        pr_result = ctx.pr.find_prs_for_branch(assignment.branch_name, state="all")
        if isinstance(pr_result, PRLookupError):
            detail = pr_result.stderr or "gh pr list failed"
            entries.append(
                _build_entry(
                    assignment,
                    action="error",
                    message=f"PR lookup failed (exit {pr_result.returncode}): {detail}",
                )
            )
            continue

        matches = _matching_prs(assignment, local_head=local_head, candidates=pr_result)
        if not matches:
            entries.append(
                _build_entry(
                    assignment,
                    action="kept_no_pr",
                    message=f"No PR matched local HEAD {local_head}.",
                )
            )
            continue

        if len(matches) > 1:
            numbers = ", ".join(f"#{pr.number}" for pr in matches)
            entries.append(
                _build_entry(
                    assignment,
                    action="error",
                    message=f"Ambiguous PR match for local HEAD {local_head}: {numbers}",
                )
            )
            continue

        pr = matches[0]
        if pr.state == "OPEN":
            entries.append(
                _build_entry(
                    assignment,
                    action="kept_open_pr",
                    pr=pr,
                    message=f"PR #{pr.number} is still open.",
                )
            )
            continue

        if dry_run:
            if ctx.git.has_uncommitted_changes(assignment.worktree_path):
                entries.append(
                    _build_entry(
                        assignment,
                        action="skipped_dirty",
                        pr=pr,
                        message=f"Worktree has uncommitted changes: {assignment.worktree_path}",
                    )
                )
                continue

            entries.append(
                _build_entry(
                    assignment,
                    action="would_free",
                    pr=pr,
                    message=f"PR #{pr.number} is {pr.state.lower()}.",
                )
            )
            continue

        free_result = free_slot_assignment(ctx, slot_name=assignment.slot_name)
        if isinstance(free_result, DirtyWorktreeError):
            entries.append(
                _build_entry(
                    assignment,
                    action="skipped_dirty",
                    pr=pr,
                    message=f"Worktree has uncommitted changes: {free_result.worktree_path}",
                )
            )
            continue
        if isinstance(free_result, SlotNotAssignedError):
            entries.append(
                _build_entry(
                    assignment,
                    action="error",
                    pr=pr,
                    message=f"{assignment.slot_name} is no longer assigned.",
                )
            )
            continue

        entries.append(
            _build_entry(
                assignment,
                action="freed",
                pr=pr,
                message=f"Freed after PR #{pr.number} became {pr.state.lower()}.",
            )
        )

    return _summarize_counts(tuple(entries), dry_run=dry_run)
