"""Pool-state sync diagnostics.

Each check function is pure with respect to its inputs — it reads through
the gateways but never writes. :func:`run_sync_diagnostics` orchestrates all
six checks and returns the combined issue list.

The six diagnostic codes mirror erk's slot diagnostics minus ``closed-pr``
(which would require coupling to a GitHub gateway; explicitly scoped out of
the slots port).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from twerk_slots.gateway.git import GitGateway, WorktreeInfo
from twerk_slots.gateway.storage import SlotsStorageGateway
from twerk_slots.naming import extract_slot_number, generate_slot_name
from twerk_slots.pool_state import PoolState, SlotAssignment

SyncIssueCode = Literal[
    "orphan-state",
    "orphan-dir",
    "missing-branch",
    "branch-mismatch",
    "git-registry-missing",
    "untracked-worktree",
]


@dataclass(frozen=True)
class SyncIssue:
    """A single pool-state inconsistency found by diagnostics."""

    code: SyncIssueCode
    message: str
    slot_name: str


def _managed_git_slots(
    worktrees: tuple[WorktreeInfo, ...],
    worktrees_dir: Path,
) -> dict[str, WorktreeInfo]:
    """Return git worktrees whose path lives directly under ``worktrees_dir``
    and whose name matches the slot naming convention."""
    result: dict[str, WorktreeInfo] = {}
    for wt in worktrees:
        if wt.path.parent != worktrees_dir:
            continue
        if extract_slot_number(wt.path.name) is None:
            continue
        result[wt.path.name] = wt
    return result


def _slot_dirs_on_disk(
    worktrees_dir: Path,
    storage: SlotsStorageGateway,
) -> tuple[str, ...]:
    """Return directory names under ``worktrees_dir`` that look like slots."""
    names = storage.list_subdirs(worktrees_dir)
    return tuple(name for name in names if extract_slot_number(name) is not None)


def _check_orphan_states(
    assignments: tuple[SlotAssignment, ...],
    storage: SlotsStorageGateway,
) -> list[SyncIssue]:
    """Assignments whose ``worktree_path`` is missing from disk."""
    issues: list[SyncIssue] = []
    for assignment in assignments:
        if not storage.path_exists(assignment.worktree_path):
            issues.append(
                SyncIssue(
                    code="orphan-state",
                    message=(
                        f"Slot {assignment.slot_name}: directory does not exist "
                        f"at {assignment.worktree_path}"
                    ),
                    slot_name=assignment.slot_name,
                )
            )
    return issues


def _check_orphan_dirs(
    state: PoolState,
    disk_slot_names: tuple[str, ...],
) -> list[SyncIssue]:
    """Slot-shaped directories on disk whose number is outside the pool size."""
    known_slots = {generate_slot_name(i) for i in range(1, state.pool_size + 1)}
    issues: list[SyncIssue] = []
    for name in disk_slot_names:
        if name in known_slots:
            continue
        issues.append(
            SyncIssue(
                code="orphan-dir",
                message=(f"Directory {name}: outside pool range (pool_size={state.pool_size})"),
                slot_name=name,
            )
        )
    return issues


def _check_missing_branches(
    assignments: tuple[SlotAssignment, ...],
    git: GitGateway,
) -> list[SyncIssue]:
    """Assignments whose branch no longer exists as a local branch."""
    issues: list[SyncIssue] = []
    for assignment in assignments:
        if not git.branch_exists(assignment.branch_name):
            issues.append(
                SyncIssue(
                    code="missing-branch",
                    message=(
                        f"Slot {assignment.slot_name}: branch '{assignment.branch_name}' deleted"
                    ),
                    slot_name=assignment.slot_name,
                )
            )
    return issues


def _check_git_worktree_mismatch(
    state: PoolState,
    git_slots: dict[str, WorktreeInfo],
) -> list[SyncIssue]:
    """Compare pool.json assignments against git's worktree registry.

    Produces three codes:
        - ``branch-mismatch`` when a slot's worktree reports a different branch,
        - ``git-registry-missing`` when an assignment has no git worktree,
        - ``untracked-worktree`` when a git worktree exists for a slot name
          that falls outside the pool's slot range.
    """
    issues: list[SyncIssue] = []

    for assignment in state.assignments:
        wt = git_slots.get(assignment.slot_name)
        if wt is None:
            issues.append(
                SyncIssue(
                    code="git-registry-missing",
                    message=f"Slot {assignment.slot_name}: not in git worktree registry",
                    slot_name=assignment.slot_name,
                )
            )
            continue
        if wt.branch != assignment.branch_name:
            issues.append(
                SyncIssue(
                    code="branch-mismatch",
                    message=(
                        f"Slot {assignment.slot_name}: pool says "
                        f"'{assignment.branch_name}', git says '{wt.branch}'"
                    ),
                    slot_name=assignment.slot_name,
                )
            )

    known_slots = {generate_slot_name(i) for i in range(1, state.pool_size + 1)}
    for slot_name, wt in git_slots.items():
        if slot_name in known_slots:
            continue
        issues.append(
            SyncIssue(
                code="untracked-worktree",
                message=(
                    f"Slot {slot_name}: in git registry (branch '{wt.branch}') "
                    f"but outside pool range (pool_size={state.pool_size})"
                ),
                slot_name=slot_name,
            )
        )

    return issues


def run_sync_diagnostics(
    *,
    state: PoolState,
    worktrees_dir: Path,
    git: GitGateway,
    storage: SlotsStorageGateway,
) -> tuple[SyncIssue, ...]:
    """Run all sync diagnostics against ``state`` and return the combined list."""
    git_slots = _managed_git_slots(git.list_worktrees(), worktrees_dir)
    disk_slot_names = _slot_dirs_on_disk(worktrees_dir, storage)

    issues: list[SyncIssue] = []
    issues.extend(_check_orphan_states(state.assignments, storage))
    issues.extend(_check_orphan_dirs(state, disk_slot_names))
    issues.extend(_check_missing_branches(state.assignments, git))
    issues.extend(_check_git_worktree_mismatch(state, git_slots))
    return tuple(issues)
