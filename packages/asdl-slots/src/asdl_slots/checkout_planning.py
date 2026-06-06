"""Pure planners for `slot checkout` and `slot checkout --current`.

Pure functions over a :class:`SlotInventory` and the :class:`GitGateway`,
returning tagged-union plans consumed by the lifecycle coordinator.
Inventory-only — no persisted pool state involvement.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure, WorktreeInfo, WorktreeOccupancy
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


def _operation_occupancy(record: SlotRecord) -> WorktreeOccupancy | None:
    if record.branch is None or record.operation is None:
        return None
    return WorktreeOccupancy(
        path=record.path,
        branch=record.branch,
        operation=record.operation,
    )


def plan_checkout(
    inventory: SlotInventory,
    git: GitGateway,
    branch_name: str,
) -> CheckoutPlan:
    match = inventory.find_by_branch(branch_name)
    if isinstance(match, SlotMatch):
        occupancy = _operation_occupancy(match.record)
        if occupancy is not None:
            return BranchInUse(occupancy=occupancy)
        return ReuseAssignment(record=match.record)
    if isinstance(match, MainWorktreeMatch):
        return BranchInMainWorktree(main_path=match.worktree.path)

    occupancy = inventory.find_occupancy_by_branch(branch_name)
    if occupancy is not None:
        return BranchInUse(occupancy=occupancy)

    target = inventory.lowest_available(git)
    if target is None:
        return PoolFull(
            assigned=tuple(r for r in inventory.records if r.branch is not None),
        )
    return AssignToSlot(record=target)


@dataclass(frozen=True)
class CheckoutCurrentWorktreeBranch:
    """Planned redirect that checks the current worktree out to a branch."""

    branch_name: str
    note: str | None = None


@dataclass(frozen=True)
class DetachCurrentWorktreeHead:
    """Planned redirect that detaches the current worktree at a ref."""

    ref: str
    note: str | None = None


CurrentWorktreeRedirect = CheckoutCurrentWorktreeBranch | DetachCurrentWorktreeHead


def plan_current_wt_redirect(
    git: GitGateway,
    *,
    cwd: Path,
    moving_branch: str,
) -> CurrentWorktreeRedirect:
    """Plan how to move the current worktree off ``moving_branch`` without mutating git.

    Strategy:
    1. Reflog previous branch if valid (exists, not self, not checked out elsewhere).
    2. If cwd looks like a slot worktree: detach HEAD at trunk (mirrors ``slot free``).
    3. Otherwise (main repo wt): trunk branch; if busy, detach HEAD at moving_branch.
    """
    worktrees = git.list_worktrees()
    previous = git.get_previous_branch(cwd)
    if previous and previous != moving_branch and git.branch_exists(previous):
        conflict = next(
            (wt for wt in worktrees if wt.branch == previous and wt.path != cwd),
            None,
        )
        if conflict is None:
            return CheckoutCurrentWorktreeBranch(branch_name=previous)

    trunk = git.get_trunk_branch()
    if extract_slot_number(cwd.name) is not None:
        return DetachCurrentWorktreeHead(ref=trunk)

    busy_wt = next(
        (wt for wt in worktrees if wt.branch == trunk and wt.path != cwd),
        None,
    )
    if busy_wt is None:
        return CheckoutCurrentWorktreeBranch(branch_name=trunk)
    return DetachCurrentWorktreeHead(
        ref=moving_branch,
        note=(
            f"Trunk branch '{trunk}' is checked out in {busy_wt.path}; "
            f"left {cwd} on a detached HEAD at {moving_branch}."
        ),
    )


def _inventory_without_current_worktree_branch(
    inventory: SlotInventory,
    *,
    cwd: Path,
    moving_branch: str,
) -> SlotInventory:
    main_worktree = inventory.main_worktree
    if (
        main_worktree is not None
        and main_worktree.path == cwd
        and main_worktree.branch == moving_branch
    ):
        main_worktree = WorktreeInfo(
            path=main_worktree.path,
            branch=None,
            is_bare=main_worktree.is_bare,
        )

    branch_occupancies = tuple(
        occupancy
        for occupancy in inventory.branch_occupancies
        if not (occupancy.path == cwd and occupancy.branch == moving_branch)
    )
    return SlotInventory(
        records=inventory.records,
        main_worktree=main_worktree,
        branch_occupancies=branch_occupancies,
    )


@dataclass(frozen=True)
class CurrentCheckoutPlan:
    """Outcome of ``plan_current_checkout``: a checkout plan plus planned redirect."""

    plan: CheckoutPlan
    branch_name: str
    current_wt_redirect: CurrentWorktreeRedirect | None


def plan_current_checkout(
    git: GitGateway,
    *,
    cwd: Path,
    main_repo_root: Path | None = None,
) -> CurrentCheckoutPlan | DetachedHeadError | DirtyCurrentWorktreeError:
    """Plan a `slot checkout --current` without mutating git.

    The planner validates the current branch, computes the redirect strategy,
    simulates the post-redirect inventory, then delegates to ``plan_checkout``.
    Lifecycle code executes the redirect only after allocation preflight succeeds.
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
            current_wt_redirect=None,
        )

    if git.has_uncommitted_changes(cwd):
        return DirtyCurrentWorktreeError(cwd=cwd)

    redirect = plan_current_wt_redirect(git, cwd=cwd, moving_branch=current_branch)
    post_redirect_inventory = _inventory_without_current_worktree_branch(
        inventory,
        cwd=cwd,
        moving_branch=current_branch,
    )
    plan = plan_checkout(post_redirect_inventory, git, current_branch)
    return CurrentCheckoutPlan(
        plan=plan,
        branch_name=current_branch,
        current_wt_redirect=redirect,
    )
