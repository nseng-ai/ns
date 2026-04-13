"""Slot allocation: pick a slot, create/reuse worktrees, update pool state.

All callers (CLI, integration tests) invoke :func:`allocate_slot_for_branch`
after :func:`sync_pool_assignments` has reconciled pool.json with the git
state on disk.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.git import GitGateway
from twerk_slots.gateway.pool_state_gateway import PoolStateGateway
from twerk_slots.gateway.storage import SlotsStorageGateway
from twerk_slots.naming import (
    extract_slot_number,
    generate_slot_name,
    get_placeholder_branch_name,
    is_placeholder_branch,
)
from twerk_slots.pool_state import DEFAULT_POOL_SIZE, PoolState, SlotAssignment


@dataclass(frozen=True)
class SlotAllocationResult:
    """Outcome of a successful allocation."""

    slot_name: str
    branch_name: str
    worktree_path: Path
    already_assigned: bool
    evicted_slot: str | None


@dataclass(frozen=True)
class PoolFullError:
    """Signals that allocation failed because the pool is at capacity."""

    oldest_slot: str
    oldest_branch: str


@dataclass(frozen=True)
class SlotFreeOutcome:
    """Outcome of a successful :func:`free_slot_assignment` call."""

    slot_name: str
    branch_name: str
    worktree_path: Path
    placeholder_branch: str


@dataclass(frozen=True)
class SlotNotAssignedError:
    """Signals that the requested slot has no current assignment."""

    slot_name: str


@dataclass(frozen=True)
class DirtyWorktreeError:
    """Signals that the slot's worktree has uncommitted changes."""

    slot_name: str
    worktree_path: Path


@dataclass(frozen=True)
class DetachedHeadError:
    """Signals that the current worktree is on a detached HEAD."""

    cwd: Path


@dataclass(frozen=True)
class DirtyCurrentWorktreeError:
    """Signals that the current worktree has uncommitted changes."""

    cwd: Path


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


def find_branch_assignment(state: PoolState, branch_name: str) -> SlotAssignment | None:
    for assignment in state.assignments:
        if assignment.branch_name == branch_name:
            return assignment
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

    Persists the updated state when any assignment changes. Placeholder
    branches are ignored so stub-branch mismatches don't churn the file.
    """
    updated: list[SlotAssignment] = []
    changed = False

    for assignment in state.assignments:
        if not storage.path_exists(assignment.worktree_path):
            updated.append(assignment)
            continue

        actual = git.get_current_branch(assignment.worktree_path)
        if actual is None or actual == assignment.branch_name:
            updated.append(assignment)
            continue

        if is_placeholder_branch(actual):
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
    force: bool,
) -> SlotAllocationResult | PoolFullError:
    """Assign ``branch_name`` to a slot, creating or reusing worktrees.

    Preconditions:
        - ``branch_name`` already exists as a local branch.
        - ``ensure_slots_metadata_dir(ctx.repo, ctx.storage)`` has been
          called so the worktrees directory exists.

    The algorithm: reconcile pool.json with git, short-circuit if the branch
    is already assigned (with a cleanup path for stale entries), otherwise
    try to reuse an existing inactive worktree before falling back to
    on-demand slot creation. If the pool is full, ``--force`` evicts the
    oldest assignment and reuses its slot.
    """
    state = ctx.pool_state.load() or PoolState(pool_size=DEFAULT_POOL_SIZE, assignments=())
    state = sync_pool_assignments(state, ctx.git, ctx.storage, ctx.pool_state)

    existing = find_branch_assignment(state, branch_name)
    if existing is not None:
        if ctx.storage.path_exists(existing.worktree_path):
            actual = ctx.git.get_current_branch(existing.worktree_path)
            if actual == branch_name:
                return SlotAllocationResult(
                    slot_name=existing.slot_name,
                    branch_name=branch_name,
                    worktree_path=existing.worktree_path,
                    already_assigned=True,
                    evicted_slot=None,
                )
        # Stale assignment — drop and reallocate below.
        state = PoolState(
            pool_size=state.pool_size,
            assignments=tuple(a for a in state.assignments if a.slot_name != existing.slot_name),
        )
        ctx.pool_state.save(state)

    evicted_slot: str | None = None
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
            if oldest is None or not force:
                # Pool is full and eviction not allowed (or nothing to evict).
                return PoolFullError(
                    oldest_slot=oldest.slot_name if oldest else "",
                    oldest_branch=oldest.branch_name if oldest else "",
                )

            evicted_slot = oldest.slot_name
            slot_name = oldest.slot_name
            worktree_path = oldest.worktree_path
            state = PoolState(
                pool_size=state.pool_size,
                assignments=tuple(a for a in state.assignments if a.slot_name != oldest.slot_name),
            )
            if ctx.storage.path_exists(worktree_path):
                ctx.git.checkout_branch(worktree_path, branch_name)
            else:
                ctx.storage.ensure_dir(worktree_path.parent)
                ctx.git.add_worktree(worktree_path, branch_name, create_branch=False)
        else:
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
        evicted_slot=evicted_slot,
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
    2. If cwd looks like a slot worktree: slot-specific stub branch (mirrors ``slot free``).
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
    if extract_slot_number(cwd.name) is not None:
        stub = get_placeholder_branch_name(cwd.name)
        assert stub is not None  # extract_slot_number already validated the shape
        local_branches = ctx.git.list_local_branches()
        ctx.git.create_branch(stub, moving_branch, force=stub in local_branches)
        ctx.git.checkout_branch(cwd, stub)
        return None

    # Main repo wt: trunk fallback.
    trunk = ctx.git.get_trunk_branch()
    if trunk is not None:
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

    ctx.git.detach_head(cwd, moving_branch)
    return f"No trunk branch could be resolved; left {cwd} on a detached HEAD at {moving_branch}."


def allocate_slot_for_current_branch(
    ctx: SlotsCliContext,
    *,
    cwd: Path,
    now: str,
    force: bool,
) -> CurrentBranchAllocationResult | PoolFullError | DetachedHeadError | DirtyCurrentWorktreeError:
    """Assign the branch currently checked out at ``cwd`` to a slot.

    Redirects the current wt to a safe HEAD (previous branch / trunk / stub /
    detached) before delegating to :func:`allocate_slot_for_branch`. Refuses
    when HEAD is detached or the current wt has uncommitted changes.
    """
    current_branch = ctx.git.get_current_branch(cwd)
    if current_branch is None:
        return DetachedHeadError(cwd=cwd)

    state = ctx.pool_state.load() or PoolState(pool_size=DEFAULT_POOL_SIZE, assignments=())
    state = sync_pool_assignments(state, ctx.git, ctx.storage, ctx.pool_state)
    already_in_slot = find_branch_assignment(state, current_branch) is not None

    note: str | None = None
    if not already_in_slot:
        if ctx.git.has_uncommitted_changes(cwd):
            return DirtyCurrentWorktreeError(cwd=cwd)
        note = _resolve_current_wt_redirect(ctx, cwd=cwd, moving_branch=current_branch)

    outcome = allocate_slot_for_branch(ctx, branch_name=current_branch, now=now, force=force)
    if isinstance(outcome, PoolFullError):
        return outcome
    return CurrentBranchAllocationResult(allocation=outcome, current_wt_note=note)


def find_assignment_by_slot(state: PoolState, slot_name: str) -> SlotAssignment | None:
    """Return the assignment for ``slot_name`` or None when the slot is free."""
    for assignment in state.assignments:
        if assignment.slot_name == slot_name:
            return assignment
    return None


def free_slot_assignment(
    ctx: SlotsCliContext,
    *,
    slot_name: str,
) -> SlotFreeOutcome | SlotNotAssignedError | DirtyWorktreeError:
    """Release ``slot_name``'s assignment while keeping its worktree.

    The worktree directory is preserved — only the branch assignment is
    removed from ``pool.json``. The worktree is switched to the slot's
    placeholder branch so the real branch is free for other operations
    (deletion, checkout elsewhere).

    Returns a :class:`SlotFreeOutcome` on success, or a
    :class:`SlotNotAssignedError` / :class:`DirtyWorktreeError` sentinel
    when the slot cannot be freed.
    """
    state = ctx.pool_state.load() or PoolState(pool_size=DEFAULT_POOL_SIZE, assignments=())
    state = sync_pool_assignments(state, ctx.git, ctx.storage, ctx.pool_state)

    assignment = find_assignment_by_slot(state, slot_name)
    if assignment is None:
        return SlotNotAssignedError(slot_name=slot_name)

    if ctx.git.has_uncommitted_changes(assignment.worktree_path):
        return DirtyWorktreeError(
            slot_name=slot_name,
            worktree_path=assignment.worktree_path,
        )

    placeholder = get_placeholder_branch_name(slot_name)
    # slot_name came from state.assignments so it already validated via
    # the naming rules when the assignment was created.
    assert placeholder is not None

    local_branches = ctx.git.list_local_branches()
    ctx.git.create_branch(
        placeholder,
        assignment.branch_name,
        force=placeholder in local_branches,
    )
    ctx.git.checkout_branch(assignment.worktree_path, placeholder)

    new_state = state.with_assignment_removed(slot_name)
    ctx.pool_state.save(new_state)

    return SlotFreeOutcome(
        slot_name=assignment.slot_name,
        branch_name=assignment.branch_name,
        worktree_path=assignment.worktree_path,
        placeholder_branch=placeholder,
    )
