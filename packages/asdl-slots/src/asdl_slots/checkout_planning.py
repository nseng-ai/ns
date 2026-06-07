"""Pure planners for `slot checkout` and `slot checkout --current`.

Pure functions over a :class:`SlotInventory` and the :class:`GitGateway`,
returning tagged-union plans consumed by the lifecycle coordinator.
Inventory-only — no persisted pool state involvement.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

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


@dataclass(frozen=True)
class CheckoutCurrentWorktreeBranch:
    """Redirect the caller worktree by checking out another branch."""

    branch: str
    role: Literal["previous", "trunk"]


@dataclass(frozen=True)
class DetachCurrentWorktree:
    """Redirect the caller worktree by detaching HEAD at a ref."""

    ref: str


CurrentWorktreeRedirectAction = CheckoutCurrentWorktreeBranch | DetachCurrentWorktree


@dataclass(frozen=True)
class CurrentWorktreeRedirect:
    """Pure redirect intent for the caller worktree."""

    action: CurrentWorktreeRedirectAction
    note: str | None


def _operation_occupancy(record: SlotRecord) -> WorktreeOccupancy | None:
    if record.branch is None or record.operation is None:
        return None
    return WorktreeOccupancy(
        path=record.path,
        branch=record.branch,
        operation=record.operation,
    )


def _assign_to_available_slot(
    inventory: SlotInventory,
    git: GitGateway,
) -> AssignToSlot | PoolFull:
    target = inventory.lowest_available(git)
    if target is None:
        return PoolFull(
            assigned=tuple(r for r in inventory.records if r.branch is not None),
        )
    return AssignToSlot(record=target)


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

    return _assign_to_available_slot(inventory, git)


def plan_current_wt_redirect(
    git: GitGateway,
    *,
    cwd: Path,
    moving_branch: str,
) -> CurrentWorktreeRedirect:
    """Plan how to redirect the caller worktree off ``moving_branch``.

    Strategy:
    1. Reflog previous branch if valid (exists, not self, not checked out elsewhere).
    2. If cwd looks like a slot worktree: detach HEAD at trunk (mirrors ``slot free``).
    3. Otherwise (main repo wt): trunk branch; if busy, detach HEAD at moving_branch.
    """
    previous = git.get_previous_branch(cwd)
    if previous and previous != moving_branch and git.branch_exists(previous):
        conflict = next(
            (wt for wt in git.list_worktrees() if wt.branch == previous and wt.path != cwd),
            None,
        )
        if conflict is None:
            return CurrentWorktreeRedirect(
                action=CheckoutCurrentWorktreeBranch(
                    branch=previous,
                    role="previous",
                ),
                note=None,
            )

    trunk = git.get_trunk_branch()
    if extract_slot_number(cwd.name) is not None:
        return CurrentWorktreeRedirect(
            action=DetachCurrentWorktree(ref=trunk),
            note=None,
        )

    busy_wt = next(
        (wt for wt in git.list_worktrees() if wt.branch == trunk and wt.path != cwd),
        None,
    )
    if busy_wt is None:
        return CurrentWorktreeRedirect(
            action=CheckoutCurrentWorktreeBranch(
                branch=trunk,
                role="trunk",
            ),
            note=None,
        )
    return CurrentWorktreeRedirect(
        action=DetachCurrentWorktree(ref=moving_branch),
        note=(
            f"Trunk branch '{trunk}' is checked out in {busy_wt.path}; "
            f"left {cwd} on a detached HEAD at {moving_branch}."
        ),
    )


@dataclass(frozen=True)
class CurrentCheckoutPlan:
    """Outcome of ``plan_current_checkout`` plus pure redirect intent."""

    plan: CheckoutPlan
    branch_name: str
    redirect: CurrentWorktreeRedirect | None

    @property
    def current_wt_note(self) -> str | None:
        if self.redirect is None:
            return None
        return self.redirect.note


def inventory_without_caller_branch_occupancy(
    inventory: SlotInventory,
    *,
    cwd: Path,
    moving_branch: str,
) -> SlotInventory:
    """Return an inventory view that ignores only the caller worktree's branch hold."""
    records = tuple(
        dataclasses.replace(record, branch=None, operation=None)
        if record.path == cwd and record.branch == moving_branch
        else record
        for record in inventory.records
    )
    main_worktree = inventory.main_worktree
    if (
        main_worktree is not None
        and main_worktree.path == cwd
        and main_worktree.branch == moving_branch
    ):
        main_worktree = dataclasses.replace(main_worktree, branch=None)
    branch_occupancies = tuple(
        occupancy
        for occupancy in inventory.branch_occupancies
        if not (occupancy.path == cwd and occupancy.branch == moving_branch)
    )
    return SlotInventory(
        records=records,
        main_worktree=main_worktree,
        branch_occupancies=branch_occupancies,
    )


def plan_current_checkout(
    git: GitGateway,
    *,
    cwd: Path,
    main_repo_root: Path | None = None,
) -> CurrentCheckoutPlan | DetachedHeadError | DirtyCurrentWorktreeError:
    """Plan a `slot checkout --current` without mutating the caller worktree."""
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
            redirect=None,
        )

    if git.has_uncommitted_changes(cwd):
        return DirtyCurrentWorktreeError(cwd=cwd)

    redirect = plan_current_wt_redirect(git, cwd=cwd, moving_branch=current_branch)
    adjusted_inventory = inventory_without_caller_branch_occupancy(
        inventory,
        cwd=cwd,
        moving_branch=current_branch,
    )
    return CurrentCheckoutPlan(
        plan=plan_checkout(adjusted_inventory, git, current_branch),
        branch_name=current_branch,
        redirect=redirect,
    )
