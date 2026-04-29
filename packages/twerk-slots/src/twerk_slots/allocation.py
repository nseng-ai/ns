"""Slot allocation: pick a slot, create/reuse worktrees, update pool state.

All callers (CLI, integration tests) invoke :func:`allocate_slot_for_branch`
after :func:`sync_pool_assignments` has reconciled pool.json with the git
state on disk.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.pool_state_gateway import PoolStateGateway
from twerk_slots.gateway.storage import SlotsStorageGateway
from twerk_slots.naming import (
    extract_slot_number,
    generate_slot_name,
)
from twerk_slots.pool_state import (
    AssignmentFound,
    AssignmentMissing,
    PoolState,
    SlotAssignment,
)


@dataclass(frozen=True)
class SlotAllocationResult:
    """Outcome of a successful allocation."""

    slot_name: str
    branch_name: str
    worktree_path: Path
    already_assigned: bool


@dataclass(frozen=True)
class PoolFull:
    """Signals that allocation failed because the pool is at capacity."""

    oldest_slot: str
    oldest_branch: str
    error_type: str = "pool_full"

    @property
    def message(self) -> str:
        return (
            f"Pool is full. Oldest slot {self.oldest_slot} holds "
            f"'{self.oldest_branch}'. Free a slot before checking out a new branch."
        )


@dataclass(frozen=True)
class SlotFreeOutcome:
    """Outcome of a successful :func:`free_slot_assignment` call."""

    slot_name: str
    branch_name: str
    worktree_path: Path


@dataclass(frozen=True)
class SlotNotAssigned:
    """Signals that the requested slot has no current assignment."""

    slot_name: str
    error_type: str = "slot_not_assigned"

    @property
    def message(self) -> str:
        return f"Slot {self.slot_name} is not currently assigned."


@dataclass(frozen=True)
class DirtyWorktree:
    """Signals that the slot's worktree has uncommitted changes."""

    slot_name: str
    worktree_path: Path
    error_type: str = "dirty_worktree"

    @property
    def message(self) -> str:
        return f"Slot {self.slot_name} has uncommitted changes at {self.worktree_path}."


@dataclass(frozen=True)
class DetachedWorktreeHead:
    """Signals that the current worktree is on a detached HEAD."""

    cwd: Path
    error_type: str = "detached_head"

    @property
    def message(self) -> str:
        return f"HEAD at {self.cwd} is detached. Check out a branch first."


@dataclass(frozen=True)
class DirtyCurrentWorktree:
    """Signals that the current worktree has uncommitted changes."""

    cwd: Path
    error_type: str = "dirty_worktree"

    @property
    def message(self) -> str:
        return f"Worktree at {self.cwd} has uncommitted changes. Commit or stash before continuing."


class SlotAllocationError(Exception):
    """Raised when allocation cannot proceed due to a broken repo invariant."""


def find_next_available_slot(
    state: PoolState,
    storage: SlotsStorageGateway,
    worktrees_dir: Path,
) -> int | None:
    """Return the 1-based slot number for the next unclaimed slot.

    A slot counts as unclaimed when no assignment in ``state`` names it and
    no directory on disk shadows it (the disk check detects orphaned
    worktrees left behind by manual surgery).
    """
    assigned_slots = {a.slot_name for a in state.assignments}

    for slot_num in range(1, state.pool_size + 1):
        slot_name = generate_slot_name(slot_num)
        if slot_name in assigned_slots:
            continue
        if storage.path_exists(worktrees_dir / slot_name):
            continue
        return slot_num
    return None


def find_inactive_slot(
    state: PoolState,
    git: GitGateway,
) -> tuple[str, Path] | None:
    """Find an unassigned pool worktree that can be reused.

    Walks worktrees reported by git (source of truth), prefers lower slot
    numbers, and skips slots with staged or modified files. Untracked files
    don't block reuse because ``git checkout`` leaves them alone.
    """
    assigned_slots = {a.slot_name for a in state.assignments}

    managed_worktrees: dict[str, Path] = {}
    for wt in git.list_worktrees():
        slot_name = wt.path.name
        if extract_slot_number(slot_name) is not None:
            managed_worktrees[slot_name] = wt.path

    for slot_num in range(1, state.pool_size + 1):
        slot_name = generate_slot_name(slot_num)
        if slot_name not in managed_worktrees:
            continue
        if slot_name in assigned_slots:
            continue
        wt_path = managed_worktrees[slot_name]
        status = git.get_file_status(wt_path)
        if status.staged or status.modified:
            continue
        return (slot_name, wt_path)

    return None


def find_oldest_assignment(state: PoolState) -> SlotAssignment | None:
    """Return the assignment with the earliest ``assigned_at`` timestamp."""
    if not state.assignments:
        return None
    return min(state.assignments, key=lambda a: a.assigned_at)


def sync_pool_assignments(
    state: PoolState,
    git: GitGateway,
    storage: SlotsStorageGateway,
    pool_state_gw: PoolStateGateway,
) -> PoolState:
    """Reconcile pool.json with the actual branches checked out in each slot.

    Has two phases:

    1. Update existing assignments whose recorded branch no longer matches
       the worktree's actual branch. Detached HEAD is ignored (that's the
       free-slot signal) so freed slots don't churn the file.
    2. Recover orphaned worktrees: managed slots (``slot-XX``) that have
       a real branch checked out but no assignment in pool.json. These
       arise from pool.json write races where one concurrent operation
       clobbers another's assignment. Without recovery, ``find_inactive_slot``
       would treat the orphan as reusable and could silently overwrite work.

    Persists the updated state when any assignment changes.
    """
    updated: list[SlotAssignment] = []
    changed = False

    for assignment in state.assignments:
        if not storage.path_exists(assignment.worktree_path):
            updated.append(assignment)
            continue

        actual = git.get_current_branch(assignment.worktree_path)
        if isinstance(actual, GitCommandFailure):
            raise SlotAllocationError(
                f"Failed to determine current branch at {assignment.worktree_path}: "
                f"{actual.message}"
            )
        if isinstance(actual, DetachedHead) or actual == assignment.branch_name:
            updated.append(assignment)
            continue

        updated.append(
            SlotAssignment(
                slot_name=assignment.slot_name,
                branch_name=actual,
                assigned_at=assignment.assigned_at,
                worktree_path=assignment.worktree_path,
            )
        )
        changed = True

    # Phase 2: recover orphaned worktrees (managed slots on real branches
    # with no pool assignment).
    assigned_slots = {a.slot_name for a in updated}
    for wt in git.list_worktrees():
        slot_name = wt.path.name
        if extract_slot_number(slot_name) is None:
            continue  # not a managed slot worktree
        if slot_name in assigned_slots:
            continue  # already tracked

        actual = git.get_current_branch(wt.path)
        if isinstance(actual, (GitCommandFailure, DetachedHead)):
            continue  # can't determine branch; skip silently (detached = free slot)

        updated.append(
            SlotAssignment(
                slot_name=slot_name,
                branch_name=actual,
                assigned_at=datetime.now(UTC).isoformat(),
                worktree_path=wt.path,
            )
        )
        changed = True

    if not changed:
        return state

    new_state = PoolState(pool_size=state.pool_size, assignments=tuple(updated))
    pool_state_gw.save(new_state)
    return new_state


def allocate_slot_for_branch(
    ctx: SlotsCliContext,
    *,
    branch_name: str,
    now: str,
) -> SlotAllocationResult | PoolFull:
    """Assign ``branch_name`` to a slot, creating or reusing worktrees.

    Preconditions:
        - ``branch_name`` already exists as a local branch.
        - ``ensure_slots_metadata_dir(ctx.repo, ctx.storage)`` has been
          called so the worktrees directory exists.

    The algorithm: reconcile pool.json with git, short-circuit if the branch
    is already assigned (with a cleanup path for stale entries), otherwise
    try to reuse an existing inactive worktree before falling back to
    on-demand slot creation. Returns :class:`PoolFull` when no slot
    can be allocated.
    """
    state = ctx.pool_state.load()
    state = sync_pool_assignments(state, ctx.git, ctx.storage, ctx.pool_state)

    existing_lookup = state.find_by_branch(branch_name)
    if isinstance(existing_lookup, AssignmentFound):
        existing = existing_lookup.assignment
        if ctx.storage.path_exists(existing.worktree_path):
            actual = ctx.git.get_current_branch(existing.worktree_path)
            if isinstance(actual, GitCommandFailure):
                raise SlotAllocationError(
                    f"Failed to determine current branch at {existing.worktree_path}: "
                    f"{actual.message}"
                )
            if actual == branch_name:
                return SlotAllocationResult(
                    slot_name=existing.slot_name,
                    branch_name=branch_name,
                    worktree_path=existing.worktree_path,
                    already_assigned=True,
                )
        # Stale assignment — drop and reallocate below.
        state = state.with_assignment_removed(existing.slot_name)
        ctx.pool_state.save(state)

    # If the branch is checked out in the main worktree, treat that worktree
    # as if it were a tracked assignment: return an ``already_assigned``
    # result pointing at it instead of trying to check the branch out again
    # (git would refuse). The CLI's existing "already assigned" path then
    # prints the cd line and copies it to the clipboard.
    main_wt = next(
        (wt for wt in ctx.git.list_worktrees() if wt.path == ctx.repo.main_repo_root),
        None,
    )
    if main_wt is not None and main_wt.branch == branch_name:
        return SlotAllocationResult(
            slot_name="",
            branch_name=branch_name,
            worktree_path=ctx.repo.main_repo_root,
            already_assigned=True,
        )

    slot_name: str
    worktree_path: Path

    inactive = find_inactive_slot(state, ctx.git)
    if inactive is not None:
        slot_name, worktree_path = inactive
        ctx.git.checkout_branch(worktree_path, branch_name)
    else:
        slot_num = find_next_available_slot(state, ctx.storage, ctx.repo.worktrees_dir)
        if slot_num is None:
            oldest = find_oldest_assignment(state)
            return PoolFull(
                oldest_slot=oldest.slot_name if oldest else "",
                oldest_branch=oldest.branch_name if oldest else "",
            )
        slot_name = generate_slot_name(slot_num)
        worktree_path = ctx.repo.worktrees_dir / slot_name
        ctx.storage.ensure_dir(worktree_path.parent)
        ctx.git.add_worktree(worktree_path, branch_name, create_branch=False)

    new_state = state.with_assignment_added(
        SlotAssignment(
            slot_name=slot_name,
            branch_name=branch_name,
            assigned_at=now,
            worktree_path=worktree_path,
        )
    )
    ctx.pool_state.save(new_state)

    return SlotAllocationResult(
        slot_name=slot_name,
        branch_name=branch_name,
        worktree_path=worktree_path,
        already_assigned=False,
    )


@dataclass(frozen=True)
class CurrentBranchAllocationResult:
    """Outcome of ``allocate_slot_for_current_branch``: the allocation plus a
    description of what happened to the original worktree's HEAD."""

    allocation: SlotAllocationResult
    current_wt_note: str | None


def _resolve_current_wt_redirect(
    ctx: SlotsCliContext,
    *,
    cwd: Path,
    moving_branch: str,
) -> str | None:
    """Redirect the current wt off ``moving_branch``; return a human-readable note.

    Strategy:
    1. Reflog previous branch if valid (exists, not self, not checked out elsewhere).
    2. If cwd looks like a slot worktree: detach HEAD at trunk (mirrors ``slot free``).
    3. Otherwise (main repo wt): trunk branch; if busy, detach HEAD at moving_branch.

    Returns None when no redirect was needed/performed (shouldn't happen in practice).
    """
    previous = ctx.git.get_previous_branch(cwd)
    if previous and previous != moving_branch and ctx.git.branch_exists(previous):
        conflict = next(
            (wt for wt in ctx.git.list_worktrees() if wt.branch == previous and wt.path != cwd),
            None,
        )
        if conflict is None:
            ctx.git.checkout_branch(cwd, previous)
            return None

    # Previous branch unusable. Branch on cwd kind.
    trunk = ctx.git.get_trunk_branch()
    if extract_slot_number(cwd.name) is not None:
        ctx.git.detach_head(cwd, trunk)
        return None

    # Main repo wt: trunk fallback.
    busy_wt = next(
        (wt for wt in ctx.git.list_worktrees() if wt.branch == trunk and wt.path != cwd),
        None,
    )
    if busy_wt is None:
        ctx.git.checkout_branch(cwd, trunk)
        return None
    ctx.git.detach_head(cwd, moving_branch)
    return (
        f"Trunk branch '{trunk}' is checked out in {busy_wt.path}; "
        f"left {cwd} on a detached HEAD at {moving_branch}."
    )


def allocate_slot_for_current_branch(
    ctx: SlotsCliContext,
    *,
    cwd: Path,
    now: str,
) -> CurrentBranchAllocationResult | PoolFull | DetachedWorktreeHead | DirtyCurrentWorktree:
    """Assign the branch currently checked out at ``cwd`` to a slot.

    Redirects the current wt to a safe HEAD (previous branch / trunk /
    detached) before delegating to :func:`allocate_slot_for_branch`. Refuses
    when HEAD is detached or the current wt has uncommitted changes.
    """
    current_branch = ctx.git.get_current_branch(cwd)
    if isinstance(current_branch, GitCommandFailure):
        raise SlotAllocationError(
            f"Failed to determine current branch at {cwd}: {current_branch.message}"
        )
    if isinstance(current_branch, DetachedHead):
        return DetachedWorktreeHead(cwd=cwd)

    state = ctx.pool_state.load()
    state = sync_pool_assignments(state, ctx.git, ctx.storage, ctx.pool_state)
    already_in_slot = isinstance(state.find_by_branch(current_branch), AssignmentFound)

    note: str | None = None
    if not already_in_slot:
        if ctx.git.has_uncommitted_changes(cwd):
            return DirtyCurrentWorktree(cwd=cwd)
        note = _resolve_current_wt_redirect(ctx, cwd=cwd, moving_branch=current_branch)

    outcome = allocate_slot_for_branch(ctx, branch_name=current_branch, now=now)
    if isinstance(outcome, PoolFull):
        return outcome
    return CurrentBranchAllocationResult(allocation=outcome, current_wt_note=note)


def free_slot_assignment(
    ctx: SlotsCliContext,
    *,
    slot_name: str,
) -> SlotFreeOutcome | SlotNotAssigned | DirtyWorktree:
    """Release ``slot_name``'s assignment while keeping its worktree.

    The worktree directory is preserved — only the branch assignment is
    removed from ``pool.json``. The worktree is detached at the trunk
    commit so the real branch is free for other operations (deletion,
    checkout elsewhere).

    Returns a :class:`SlotFreeOutcome` on success, or a
    :class:`SlotNotAssigned` / :class:`DirtyWorktree` sentinel
    when the slot cannot be freed.
    """
    state = ctx.pool_state.load()
    state = sync_pool_assignments(state, ctx.git, ctx.storage, ctx.pool_state)

    lookup = state.find_by_slot(slot_name)
    if isinstance(lookup, AssignmentMissing):
        return SlotNotAssigned(slot_name=slot_name)
    assignment = lookup.assignment

    if ctx.git.has_uncommitted_changes(assignment.worktree_path):
        return DirtyWorktree(
            slot_name=slot_name,
            worktree_path=assignment.worktree_path,
        )

    trunk = ctx.git.get_trunk_branch()
    try:
        ctx.git.detach_head(assignment.worktree_path, trunk)
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else str(exc)
        raise SlotAllocationError(
            f"Failed to detach {slot_name} at {assignment.worktree_path} to {trunk}: {stderr}"
        ) from exc

    new_state = state.with_assignment_removed(slot_name)
    ctx.pool_state.save(new_state)

    return SlotFreeOutcome(
        slot_name=assignment.slot_name,
        branch_name=assignment.branch_name,
        worktree_path=assignment.worktree_path,
    )
