"""Pure planners for `slot checkout` and `slot checkout --current`.

Pure functions over a :class:`SlotInventory` and the :class:`GitGateway`,
returning tagged-union plans consumed by the lifecycle coordinator.
Inventory-only — no persisted pool state involvement.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure, WorktreeOccupancy
from asdl_slots.errors import (
    DetachedHeadError,
    DirtyCurrentWorktreeError,
    SlotAllocationError,
)
from asdl_slots.inventory import (
    MainWorktreeMatch,
    SlotInventory,
    SlotMatch,
    SlotRecord,
    build_slot_inventory,
)
from asdl_slots.naming import extract_slot_number


@dataclass(frozen=True)
class ReuseAssignment:
    """Branch is already in a managed slot — reuse without touching git."""

    record: SlotRecord


@dataclass(frozen=True)
class BranchInMainWorktree:
    """Branch lives on the main worktree — redirect there."""

    main_path: Path


@dataclass(frozen=True)
class AssignToSlot:
    """Allocate to the lowest-numbered clean detached managed slot."""

    record: SlotRecord


@dataclass(frozen=True)
class BranchInUse:
    """Branch is held by another worktree (checked out, rebasing, or bisecting).

    Caught up front so the user sees a clear, actionable message instead of a
    raw git checkout failure deep in the lifecycle.
    """

    occupancy: WorktreeOccupancy


@dataclass(frozen=True)
class PoolFull:
    """No clean detached slot is available; surface the assigned pairs."""

    assigned: tuple[SlotRecord, ...]


CheckoutPlan = ReuseAssignment | BranchInMainWorktree | BranchInUse | AssignToSlot | PoolFull


def plan_checkout(
    inventory: SlotInventory,
    git: GitGateway,
    branch_name: str,
) -> CheckoutPlan:
    match = inventory.find_by_branch(branch_name)
    if isinstance(match, SlotMatch):
        return ReuseAssignment(record=match.record)
    if isinstance(match, MainWorktreeMatch):
        return BranchInMainWorktree(main_path=match.worktree.path)

    occupancy = next(
        (occ for occ in git.list_branch_occupancies() if occ.branch == branch_name),
        None,
    )
    if occupancy is not None:
        return BranchInUse(occupancy=occupancy)

    target = inventory.lowest_available(git)
    if target is None:
        return PoolFull(
            assigned=tuple(r for r in inventory.records if r.branch is not None),
        )
    return AssignToSlot(record=target)


def resolve_current_wt_redirect(
    git: GitGateway,
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
    previous = git.get_previous_branch(cwd)
    if previous and previous != moving_branch and git.branch_exists(previous):
        conflict = next(
            (wt for wt in git.list_worktrees() if wt.branch == previous and wt.path != cwd),
            None,
        )
        if conflict is None:
            failure = git.checkout_branch(cwd, previous)
            if failure is not None:
                raise SlotAllocationError(
                    f"Failed to check out '{previous}' in {cwd}: {failure.message}"
                )
            return None

    trunk = git.get_trunk_branch()
    if extract_slot_number(cwd.name) is not None:
        git.detach_head(cwd, trunk)
        return None

    busy_wt = next(
        (wt for wt in git.list_worktrees() if wt.branch == trunk and wt.path != cwd),
        None,
    )
    if busy_wt is None:
        failure = git.checkout_branch(cwd, trunk)
        if failure is not None:
            raise SlotAllocationError(
                f"Failed to check out trunk branch '{trunk}' in {cwd}: {failure.message}"
            )
        return None
    git.detach_head(cwd, moving_branch)
    return (
        f"Trunk branch '{trunk}' is checked out in {busy_wt.path}; "
        f"left {cwd} on a detached HEAD at {moving_branch}."
    )


@dataclass(frozen=True)
class CurrentCheckoutPlan:
    """Outcome of ``plan_current_checkout``: a checkout plan plus the
    redirect note describing what happened to the original worktree's HEAD."""

    plan: CheckoutPlan
    branch_name: str
    current_wt_note: str | None


def plan_current_checkout(
    git: GitGateway,
    *,
    cwd: Path,
    main_repo_root: Path | None = None,
) -> CurrentCheckoutPlan | DetachedHeadError | DirtyCurrentWorktreeError:
    """Plan a `slot checkout --current`.

    Mirrors the order of the legacy ``allocate_slot_for_current_branch``:
    detached-head check → already-in-slot fast path → dirty check →
    redirect via ``resolve_current_wt_redirect`` → delegate to
    ``plan_checkout``.

    Builds the inventory internally because the redirect mutates worktree
    state and the post-redirect plan must see the moved main worktree.
    """
    current_branch = git.get_current_branch(cwd)
    if isinstance(current_branch, GitCommandFailure):
        raise SlotAllocationError(
            f"Failed to determine current branch at {cwd}: {current_branch.message}"
        )
    if isinstance(current_branch, DetachedHead):
        return DetachedHeadError(cwd=cwd)

    inventory = build_slot_inventory(git, main_repo_root=main_repo_root)
    already_match = inventory.find_by_branch(current_branch)
    if isinstance(already_match, SlotMatch):
        return CurrentCheckoutPlan(
            plan=ReuseAssignment(record=already_match.record),
            branch_name=current_branch,
            current_wt_note=None,
        )

    if git.has_uncommitted_changes(cwd):
        return DirtyCurrentWorktreeError(cwd=cwd)

    note = resolve_current_wt_redirect(git, cwd=cwd, moving_branch=current_branch)
    fresh = build_slot_inventory(git, main_repo_root=main_repo_root)
    plan = plan_checkout(fresh, git, current_branch)
    return CurrentCheckoutPlan(
        plan=plan,
        branch_name=current_branch,
        current_wt_note=note,
    )
