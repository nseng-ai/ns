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
from twerk_slots.naming import extract_slot_number, generate_slot_name, is_placeholder_branch
from twerk_slots.pool_state import DEFAULT_POOL_SIZE, PoolState, SlotAssignment


@dataclass(frozen=True)
class SlotAllocationResult:
    """Outcome of a successful allocation."""

    slot_name: str
    branch_name: str
    worktree_path: Path
    already_assigned: bool
    evicted_slot: str | None = None


@dataclass(frozen=True)
class PoolFullError:
    """Signals that allocation failed because the pool is at capacity."""

    oldest_slot: str
    oldest_branch: str


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
    repo_root: Path,
) -> tuple[str, Path] | None:
    """Find an unassigned pool worktree that can be reused.

    Walks worktrees reported by git (source of truth), prefers lower slot
    numbers, and skips slots with staged or modified files. Untracked files
    don't block reuse because ``git checkout`` leaves them alone.
    """
    assigned_slots = {a.slot_name for a in state.assignments}

    managed_worktrees: dict[str, Path] = {}
    for wt in git.list_worktrees(repo_root):
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
    pool_json_path: Path,
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
    pool_state_gw.save(pool_json_path, new_state)
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
    state = ctx.pool_state.load(ctx.repo.pool_json_path) or PoolState(
        pool_size=DEFAULT_POOL_SIZE, assignments=()
    )
    state = sync_pool_assignments(
        state, ctx.git, ctx.storage, ctx.pool_state, ctx.repo.pool_json_path
    )

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
                )
        # Stale assignment — drop and reallocate below.
        state = PoolState(
            pool_size=state.pool_size,
            assignments=tuple(a for a in state.assignments if a.slot_name != existing.slot_name),
        )
        ctx.pool_state.save(ctx.repo.pool_json_path, state)

    evicted_slot: str | None = None
    slot_name: str
    worktree_path: Path

    inactive = find_inactive_slot(state, ctx.git, ctx.repo.root)
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
                ctx.git.add_worktree(ctx.repo.root, worktree_path, branch_name, create_branch=False)
        else:
            slot_name = generate_slot_name(slot_num)
            worktree_path = ctx.repo.worktrees_dir / slot_name
            ctx.storage.ensure_dir(worktree_path.parent)
            ctx.git.add_worktree(ctx.repo.root, worktree_path, branch_name, create_branch=False)

    new_assignment = SlotAssignment(
        slot_name=slot_name,
        branch_name=branch_name,
        assigned_at=now,
        worktree_path=worktree_path,
    )
    new_state = PoolState(
        pool_size=state.pool_size,
        assignments=(*state.assignments, new_assignment),
    )
    ctx.pool_state.save(ctx.repo.pool_json_path, new_state)

    return SlotAllocationResult(
        slot_name=slot_name,
        branch_name=branch_name,
        worktree_path=worktree_path,
        already_assigned=False,
        evicted_slot=evicted_slot,
    )
