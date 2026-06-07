from __future__ import annotations

from pathlib import Path

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, FileStatus, WorktreeInfo, WorktreeOccupancy
from asdl_slots.checkout_planning import (
    AssignToSlot,
    BranchInMainWorktree,
    BranchInUse,
    CheckoutCurrentWorktreeBranch,
    CurrentCheckoutPlan,
    DetachCurrentWorktree,
    PoolFull,
    ReuseAssignment,
    plan_checkout,
    plan_current_checkout,
)
from asdl_slots.errors import (
    DetachedHeadError,
    DirtyCurrentWorktreeError,
)
from asdl_slots.inventory import SlotInventory, SlotRecord


def _record(
    n: int,
    branch: str | None = None,
    *,
    operation: str | None = None,
) -> SlotRecord:
    return SlotRecord(
        slot_name=f"slot-{n:02d}",
        slot_number=n,
        path=Path(f"/wt/slot-{n:02d}"),
        branch=branch,
        operation=operation,
    )


def _inventory(
    *records: SlotRecord,
    main_worktree: WorktreeInfo | None = None,
    branch_occupancies: tuple[WorktreeOccupancy, ...] = (),
) -> SlotInventory:
    return SlotInventory(
        records=tuple(sorted(records, key=lambda r: r.slot_number)),
        main_worktree=main_worktree,
        branch_occupancies=branch_occupancies,
    )


# -- plan_checkout ----------------------------------------------------------


def test_plan_checkout_reuses_existing_slot_assignment() -> None:
    inv = _inventory(_record(1, branch="feat/x"), _record(2))
    git = FakeGitGateway()

    plan = plan_checkout(inv, git, "feat/x")

    assert isinstance(plan, ReuseAssignment)
    assert plan.record.slot_name == "slot-01"


def test_plan_checkout_redirects_to_main_worktree() -> None:
    main = WorktreeInfo(path=Path("/repo"), branch="master", is_bare=False)
    inv = _inventory(_record(1), main_worktree=main)
    git = FakeGitGateway()

    plan = plan_checkout(inv, git, "master")

    assert isinstance(plan, BranchInMainWorktree)
    assert plan.main_path == Path("/repo")


def test_plan_checkout_assigns_lowest_clean_detached_slot() -> None:
    inv = _inventory(_record(1, branch="feat/a"), _record(2), _record(3))
    git = FakeGitGateway()

    plan = plan_checkout(inv, git, "feat/new")

    assert isinstance(plan, AssignToSlot)
    assert plan.record.slot_number == 2


def test_plan_checkout_skips_dirty_available_slot() -> None:
    rec_dirty = _record(1)
    rec_clean = _record(2)
    inv = _inventory(rec_dirty, rec_clean)
    git = FakeGitGateway(
        file_status_by_path={rec_dirty.path: FileStatus(False, True, False)},
    )

    plan = plan_checkout(inv, git, "feat/new")

    assert isinstance(plan, AssignToSlot)
    assert plan.record.slot_number == 2


def test_plan_checkout_skips_dirty_with_untracked_only() -> None:
    """`has_uncommitted_changes` returns True for untracked-only too — confirm
    the planner skips those slots since checkout would refuse if checkout
    would clobber, and the legacy allocator only skipped staged/modified.
    Document the new (stricter) policy."""
    rec_untracked = _record(1)
    rec_clean = _record(2)
    inv = _inventory(rec_untracked, rec_clean)
    git = FakeGitGateway(
        file_status_by_path={rec_untracked.path: FileStatus(False, False, True)},
    )

    plan = plan_checkout(inv, git, "feat/new")

    assert isinstance(plan, AssignToSlot)
    assert plan.record.slot_number == 2


def test_plan_checkout_branch_in_use_by_rebasing_detached_slot() -> None:
    """Inventory records operation-held branches as assigned, but checkout must
    surface them as in-progress operations rather than normal reusable slots."""
    slot_path = Path("/wt/slot-06")
    inv = _inventory(_record(6, branch="feat/x", operation="rebase"))
    git = FakeGitGateway()

    plan = plan_checkout(inv, git, "feat/x")

    assert isinstance(plan, BranchInUse)
    assert plan.occupancy == WorktreeOccupancy(
        path=slot_path,
        branch="feat/x",
        operation="rebase",
    )


def test_plan_checkout_branch_in_use_by_non_managed_operation() -> None:
    external_path = Path("/repo/external")
    inv = _inventory(
        _record(1),
        branch_occupancies=(
            WorktreeOccupancy(path=external_path, branch="feat/x", operation="bisect"),
        ),
    )
    git = FakeGitGateway()

    plan = plan_checkout(inv, git, "feat/x")

    assert isinstance(plan, BranchInUse)
    assert plan.occupancy == WorktreeOccupancy(
        path=external_path,
        branch="feat/x",
        operation="bisect",
    )


def test_plan_checkout_new_branch_skips_operation_occupied_slot() -> None:
    inv = _inventory(
        _record(1, branch="feat/rebase", operation="rebase"),
        _record(2),
    )
    git = FakeGitGateway()

    plan = plan_checkout(inv, git, "feat/new")

    assert isinstance(plan, AssignToSlot)
    assert plan.record.slot_name == "slot-02"


def test_plan_checkout_pool_full_lists_assigned_records() -> None:
    inv = _inventory(
        _record(1, branch="feat/a"),
        _record(2, branch="feat/b"),
    )
    git = FakeGitGateway()

    plan = plan_checkout(inv, git, "feat/c")

    assert isinstance(plan, PoolFull)
    assert tuple((r.slot_name, r.branch) for r in plan.assigned) == (
        ("slot-01", "feat/a"),
        ("slot-02", "feat/b"),
    )


def test_plan_checkout_pool_full_when_only_dirty_slots_remain() -> None:
    rec_assigned = _record(1, branch="feat/a")
    rec_dirty = _record(2)
    inv = _inventory(rec_assigned, rec_dirty)
    git = FakeGitGateway(
        file_status_by_path={rec_dirty.path: FileStatus(True, False, False)},
    )

    plan = plan_checkout(inv, git, "feat/new")

    assert isinstance(plan, PoolFull)
    assert tuple(r.slot_name for r in plan.assigned) == ("slot-01",)


def test_plan_checkout_empty_inventory_is_pool_full() -> None:
    inv = _inventory()
    git = FakeGitGateway()

    plan = plan_checkout(inv, git, "feat/new")

    assert isinstance(plan, PoolFull)
    assert plan.assigned == ()


# -- plan_current_checkout --------------------------------------------------


def _slot_wt(slot_number: int, branch: str | None) -> WorktreeInfo:
    return WorktreeInfo(
        path=Path(f"/wt/slot-{slot_number:02d}"),
        branch=branch,
        is_bare=False,
    )


def test_plan_current_checkout_rejects_detached_head() -> None:
    cwd = Path("/repo")
    git = FakeGitGateway(current_branch_by_path={cwd: DetachedHead()})

    result = plan_current_checkout(git, cwd=cwd)

    assert isinstance(result, DetachedHeadError)
    assert result.cwd == cwd


def test_plan_current_checkout_already_in_slot_short_circuits() -> None:
    cwd = Path("/repo")
    git = FakeGitGateway(
        worktrees=(_slot_wt(1, "feat/x"),),
        current_branch_by_path={cwd: "feat/x"},
    )

    result = plan_current_checkout(git, cwd=cwd)

    assert isinstance(result, CurrentCheckoutPlan)
    assert isinstance(result.plan, ReuseAssignment)
    assert result.plan.record.slot_name == "slot-01"
    assert result.branch_name == "feat/x"
    assert result.redirect is None
    assert result.current_wt_note is None
    # Already-in-slot path doesn't redirect: cwd's branch is preserved.
    assert git.get_current_branch(cwd) == "feat/x"


def test_plan_current_checkout_dirty_main_worktree_refuses() -> None:
    cwd = Path("/repo")
    git = FakeGitGateway(
        worktrees=(_slot_wt(1, None),),
        current_branch_by_path={cwd: "feat/x"},
        file_status_by_path={cwd: FileStatus(False, True, False)},
        branches=("feat/x",),
    )

    result = plan_current_checkout(git, cwd=cwd)

    assert isinstance(result, DirtyCurrentWorktreeError)
    assert result.cwd == cwd
    # No redirect occurred.
    assert git.get_current_branch(cwd) == "feat/x"


def test_plan_current_checkout_redirects_to_previous_branch() -> None:
    cwd = Path("/repo")
    git = FakeGitGateway(
        branches=("feat/x", "some-other"),
        current_branch_by_path={cwd: "feat/x"},
        previous_branch_by_path={cwd: "some-other"},
        worktrees=(
            WorktreeInfo(path=cwd, branch="feat/x", is_bare=False),
            _slot_wt(1, None),
        ),
    )

    result = plan_current_checkout(git, cwd=cwd, main_repo_root=cwd)

    assert isinstance(result, CurrentCheckoutPlan)
    assert isinstance(result.plan, AssignToSlot)
    assert result.branch_name == "feat/x"
    assert result.plan.record.slot_name == "slot-01"
    assert result.redirect is not None
    assert isinstance(result.redirect.action, CheckoutCurrentWorktreeBranch)
    assert result.redirect.action.branch == "some-other"
    assert result.redirect.note is None
    # Planning is pure: cwd remains on the moving branch.
    assert git.get_current_branch(cwd) == "feat/x"


def test_plan_current_checkout_pool_full_preserves_caller_branch() -> None:
    cwd = Path("/repo")
    git = FakeGitGateway(
        branches=("feat/x", "main"),
        trunk_branch="main",
        current_branch_by_path={cwd: "feat/x"},
        worktrees=(
            WorktreeInfo(path=cwd, branch="feat/x", is_bare=False),
            _slot_wt(1, "feat/a"),
        ),
    )

    result = plan_current_checkout(git, cwd=cwd, main_repo_root=cwd)

    assert isinstance(result, CurrentCheckoutPlan)
    assert isinstance(result.plan, PoolFull)
    assert result.branch_name == "feat/x"
    assert git.get_current_branch(cwd) == "feat/x"


def test_plan_current_checkout_branch_in_main_plans_redirect_then_assignment() -> None:
    """When the moving branch lives in the main worktree, planning ignores the
    caller worktree's own occupancy and plans a slot assignment without mutation."""
    cwd = Path("/repo")
    git = FakeGitGateway(
        branches=("feat/x", "main", "some-other"),
        trunk_branch="main",
        current_branch_by_path={cwd: "feat/x"},
        previous_branch_by_path={cwd: "some-other"},
        worktrees=(
            WorktreeInfo(path=cwd, branch="feat/x", is_bare=False),
            _slot_wt(1, None),
        ),
    )

    result = plan_current_checkout(git, cwd=cwd, main_repo_root=cwd)

    assert isinstance(result, CurrentCheckoutPlan)
    assert isinstance(result.plan, AssignToSlot)
    assert result.plan.record.slot_name == "slot-01"
    assert result.redirect is not None
    assert isinstance(result.redirect.action, CheckoutCurrentWorktreeBranch)
    assert result.redirect.action.branch == "some-other"
    # Main remains on feat/x during pure planning.
    assert git.get_current_branch(cwd) == "feat/x"


def test_plan_current_checkout_plans_trunk_redirect_without_mutation() -> None:
    cwd = Path("/repo")
    git = FakeGitGateway(
        branches=("feat/x", "main"),
        trunk_branch="main",
        current_branch_by_path={cwd: "feat/x"},
        worktrees=(
            WorktreeInfo(path=cwd, branch="feat/x", is_bare=False),
            _slot_wt(1, None),
        ),
    )

    result = plan_current_checkout(git, cwd=cwd, main_repo_root=cwd)

    assert isinstance(result, CurrentCheckoutPlan)
    assert isinstance(result.plan, AssignToSlot)
    assert result.redirect is not None
    assert isinstance(result.redirect.action, CheckoutCurrentWorktreeBranch)
    assert result.redirect.action.branch == "main"
    assert result.redirect.note is None
    assert git.get_current_branch(cwd) == "feat/x"


def test_plan_current_checkout_plans_detach_when_trunk_busy_without_mutation() -> None:
    cwd = Path("/repo")
    sibling = Path("/wt/sibling")
    git = FakeGitGateway(
        branches=("feat/x", "main"),
        trunk_branch="main",
        current_branch_by_path={cwd: "feat/x"},
        worktrees=(
            WorktreeInfo(path=cwd, branch="feat/x", is_bare=False),
            _slot_wt(1, None),
            WorktreeInfo(path=sibling, branch="main", is_bare=False),
        ),
    )

    result = plan_current_checkout(git, cwd=cwd, main_repo_root=cwd)

    assert isinstance(result, CurrentCheckoutPlan)
    assert isinstance(result.plan, AssignToSlot)
    assert result.redirect is not None
    assert isinstance(result.redirect.action, DetachCurrentWorktree)
    assert result.redirect.action.ref == "feat/x"
    assert result.redirect.note is not None
    assert "checked out" in result.redirect.note
    assert "detached HEAD" in result.redirect.note
    assert git.get_current_branch(cwd) == "feat/x"
