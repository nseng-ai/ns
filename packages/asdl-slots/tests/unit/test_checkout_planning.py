from __future__ import annotations

from pathlib import Path

from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, FileStatus, WorktreeInfo, WorktreeOccupancy
from asdl_slots.checkout_planning import (
    AssignToSlot,
    BranchInMainWorktree,
    BranchInUse,
    CurrentCheckoutPlan,
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


def _record(n: int, branch: str | None = None) -> SlotRecord:
    return SlotRecord(
        slot_name=f"slot-{n:02d}",
        slot_number=n,
        path=Path(f"/wt/slot-{n:02d}"),
        branch=branch,
    )


def _inventory(
    *records: SlotRecord,
    main_worktree: WorktreeInfo | None = None,
) -> SlotInventory:
    return SlotInventory(
        records=tuple(sorted(records, key=lambda r: r.slot_number)),
        main_worktree=main_worktree,
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
    """A branch held by a slot mid-rebase has ``WorktreeInfo.branch is None``,
    so it misses ``find_by_branch`` — the occupancy probe must catch it as
    ``BranchInUse`` rather than routing to ``AssignToSlot`` and crashing in git."""
    slot_path = Path("/wt/slot-06")
    inv = _inventory(_record(6))
    git = FakeGitGateway(
        worktrees=(WorktreeInfo(path=slot_path, branch=None, is_bare=False),),
        operations_by_path={
            slot_path: WorktreeOccupancy(path=slot_path, branch="feat/x", operation="rebase"),
        },
    )

    plan = plan_checkout(inv, git, "feat/x")

    assert isinstance(plan, BranchInUse)
    assert plan.occupancy == WorktreeOccupancy(
        path=slot_path,
        branch="feat/x",
        operation="rebase",
    )


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
    # Redirect happened: cwd is now on the previous branch.
    assert git.get_current_branch(cwd) == "some-other"


def test_plan_current_checkout_pool_full_propagates_redirect() -> None:
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


def test_plan_current_checkout_branch_in_main_redirected_then_assigned() -> None:
    """When the moving branch lives in the main worktree, the redirect moves
    main off it; the post-redirect plan must see the slot pool, not surface a
    BranchInMainWorktree match."""
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
    # Main was redirected off feat/x.
    assert git.get_current_branch(cwd) == "some-other"
