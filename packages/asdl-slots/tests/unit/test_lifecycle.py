from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRGatewayFailure, PRState
from asdl_core.git.types import (
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    WorktreeInfo,
    WorktreeOccupancy,
)
from asdl_slots.inventory import SlotInventory, SlotRecord
from asdl_slots.lifecycle.checkout import checkout_branch, checkout_current
from asdl_slots.lifecycle.free import (
    execute_free_plan,
    free_slots,
    plan_free_slots,
)
from asdl_slots.lifecycle.gc import (
    execute_gc_plan,
    garbage_collect_slots,
    outcome_from_gc_plan,
    plan_gc,
    plan_gc_cleanup,
)
from asdl_slots.lifecycle.outcomes import (
    SlotCheckoutOutcome,
    SlotFreeOutcome,
    SlotFreePlan,
    SlotGcOutcome,
    SlotInitOutcome,
    SlotLifecycleFailure,
    SlotResizeOutcome,
)
from asdl_slots.lifecycle.pool import (
    build_init_plan,
    build_resize_plan,
    initialize_pool,
    resize_pool,
)
from asdl_slots.lifecycle.release import (
    SlotFreeReleaseExecution,
    SlotFreeReleasePreview,
    SlotGcReleasePreview,
    execute_free_release,
    execute_gc_release,
    plan_free_release,
    plan_gc_release,
)
from asdl_slots.lifecycle.release_cleanup import (
    SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
    execute_release_cleanup,
    plan_release_cleanup,
)
from asdl_slots.testing.lifecycle_context import (
    make_pr,
    make_repo_root,
    make_slots_lifecycle_context,
    slot_path,
    slot_worktree,
)


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


def _inventory(*records: SlotRecord) -> SlotInventory:
    return SlotInventory(records=tuple(sorted(records, key=lambda r: r.slot_number)))


def test_init_plan_creates_one_through_n() -> None:
    assert build_init_plan(3).create == (1, 2, 3)


def test_init_plan_size_one() -> None:
    assert build_init_plan(1).create == (1,)


def test_resize_grow_from_empty_yields_full_range() -> None:
    plan = build_resize_plan(_inventory(), 3)

    assert plan.create == (1, 2, 3)
    assert plan.remove == ()


def test_resize_grow_fills_gaps_then_extends() -> None:
    plan = build_resize_plan(_inventory(_record(1), _record(3)), 4)

    assert plan.create == (2, 4)
    assert plan.remove == ()


def test_resize_grow_no_gaps_only_extends() -> None:
    plan = build_resize_plan(_inventory(_record(1), _record(2)), 4)

    assert plan.create == (3, 4)
    assert plan.remove == ()


def test_resize_same_size_no_op() -> None:
    plan = build_resize_plan(_inventory(_record(1), _record(2)), 2)

    assert plan.create == ()
    assert plan.remove == ()


def test_resize_same_size_with_gap_is_still_no_op() -> None:
    # Inventory size 2 with a numeric gap; target=2 should not compact.
    plan = build_resize_plan(_inventory(_record(1), _record(3)), 2)

    assert plan.create == ()
    assert plan.remove == ()


def test_resize_shrink_removes_highest_first() -> None:
    plan = build_resize_plan(
        _inventory(_record(1), _record(2), _record(3), _record(4)),
        2,
    )

    assert plan.create == ()
    assert tuple(r.slot_number for r in plan.remove) == (3, 4)


def test_resize_shrink_with_gap_keeps_low_numbered() -> None:
    plan = build_resize_plan(_inventory(_record(1), _record(3), _record(5)), 2)

    assert plan.create == ()
    assert tuple(r.slot_number for r in plan.remove) == (5,)


def test_resize_shrink_returns_full_records() -> None:
    plan = build_resize_plan(
        _inventory(_record(1), _record(2, branch="feat/x")),
        1,
    )

    assert len(plan.remove) == 1
    removed = plan.remove[0]
    assert removed.slot_number == 2
    assert removed.branch == "feat/x"
    assert removed.path == Path("/wt/slot-02")


def test_checkout_branch_existing_branch_assigns_lowest_clean_slot(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("feat/x",),
        worktrees=(
            slot_worktree(slots_root, 1, None),
            slot_worktree(slots_root, 2, None),
        ),
    )

    outcome = checkout_branch(ctx, "feat/x", new_branch=False, base=None)

    assert isinstance(outcome, SlotCheckoutOutcome)
    assert outcome.slot_name == "slot-01"
    assert outcome.branch_name == "feat/x"
    assert outcome.worktree_path == slot_path(slots_root, 1)
    assert outcome.already_assigned is False
    assert outcome.created_branch is False
    assert outcome.current_wt_note is None
    assert git.get_current_branch(slot_path(slots_root, 1)) == "feat/x"
    assert ctx.storage.path_exists(ctx.repo.repo_dir)
    assert ctx.storage.path_exists(ctx.repo.worktrees_dir)


def test_checkout_branch_new_creates_branch_before_assigning(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(slot_worktree(slots_root, 1, None),),
    )

    outcome = checkout_branch(ctx, "feat/new", new_branch=True, base="main")

    assert isinstance(outcome, SlotCheckoutOutcome)
    assert git.branch_exists("feat/new")
    assert outcome.slot_name == "slot-01"
    assert outcome.branch_name == "feat/new"
    assert outcome.created_branch is True
    assert git.get_current_branch(slot_path(slots_root, 1)) == "feat/new"


def test_checkout_branch_pool_full_returns_failure_without_checkout(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    assigned = slot_worktree(slots_root, 1, "feat/a")
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("feat/a", "feat/b"),
        worktrees=(assigned,),
    )
    worktrees_before = git.list_worktrees()

    outcome = checkout_branch(ctx, "feat/b", new_branch=False, base=None)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "pool_full"
    assert "slot-01 -> feat/a" in outcome.message
    assert git.list_worktrees() == worktrees_before
    assert git.get_current_branch(slot_path(slots_root, 1)) == "feat/a"


def test_checkout_branch_in_use_by_rebasing_slot_returns_branch_in_use_failure(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    rebasing_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("feat/x", "main"),
        worktrees=(slot_worktree(slots_root, 1, None),),
        operations_by_path={
            rebasing_path: WorktreeOccupancy(
                path=rebasing_path,
                branch="feat/x",
                operation="rebase",
            ),
        },
    )

    outcome = checkout_branch(ctx, "feat/x", new_branch=False, base=None)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "branch_in_use"
    assert str(rebasing_path) in outcome.message
    assert "rebase" in outcome.message
    # No checkout was attempted into any slot.
    assert git._checkout_calls == []


def test_checkout_branch_surfaces_git_checkout_failure_without_raising(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    failed_path = slot_path(slots_root, 1)
    failure = GitCommandFailure(
        message="fatal: 'feat/x' is already checked out at '/wt/slot-06'",
        returncode=128,
        error_type="git_checkout_failed",
    )
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("feat/x", "main"),
        worktrees=(slot_worktree(slots_root, 1, None),),
        checkout_failures_by_path={failed_path: failure},
    )

    outcome = checkout_branch(ctx, "feat/x", new_branch=False, base=None)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "checkout_failed"
    assert "already checked out" in outcome.message
    assert git._checkout_calls == [(failed_path, "feat/x")]


def test_checkout_current_preserves_existing_redirect_behavior(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    repo_root = make_repo_root(tmp_path)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("feat/x", "some-other"),
        worktrees=(
            WorktreeInfo(path=repo_root, branch="feat/x", is_bare=False),
            slot_worktree(slots_root, 1, None),
        ),
        previous_branch_by_path={repo_root: "some-other"},
    )

    outcome = checkout_current(ctx)

    assert isinstance(outcome, SlotCheckoutOutcome)
    assert outcome.slot_name == "slot-01"
    assert outcome.branch_name == "feat/x"
    assert outcome.created_branch is False
    assert outcome.current_wt_note is None
    assert git.get_current_branch(repo_root) == "some-other"
    assert git.get_current_branch(slot_path(slots_root, 1)) == "feat/x"


def test_checkout_current_redirect_failure_uses_planner_subject(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    repo_root = make_repo_root(tmp_path)
    failure = GitCommandFailure(
        message="fatal: checkout failed",
        returncode=128,
        error_type="git_checkout_failed",
    )
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("feat/x", "some-other"),
        worktrees=(
            WorktreeInfo(path=repo_root, branch="feat/x", is_bare=False),
            slot_worktree(slots_root, 1, None),
        ),
        previous_branch_by_path={repo_root: "some-other"},
        checkout_failures_by_path={repo_root: failure},
    )

    outcome = checkout_current(ctx)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "slot_allocation_error"
    assert outcome.message == (
        f"Failed to check out 'some-other' in {repo_root}: fatal: checkout failed"
    )
    assert git._checkout_calls == [(repo_root, "some-other")]


def test_initialize_pool_creates_n_detached_worktrees_at_trunk(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(tmp_path, branches=("main",))

    outcome = initialize_pool(ctx, 3)

    assert isinstance(outcome, SlotInitOutcome)
    assert outcome.created == ("slot-01", "slot-02", "slot-03")
    assert outcome.pool_size == 3
    assert outcome.worktrees_dir == ctx.repo.worktrees_dir
    assert ctx.storage.path_exists(ctx.repo.repo_dir)
    assert ctx.storage.path_exists(ctx.repo.worktrees_dir)
    worktrees = git.list_worktrees()
    assert len(worktrees) == 3
    for n, wt in enumerate(worktrees, start=1):
        assert wt.path == slot_path(slots_root, n)
        assert wt.branch is None


def test_initialize_pool_with_existing_pool_returns_failure(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(slot_worktree(slots_root, 1, None),),
    )
    worktrees_before = git.list_worktrees()

    outcome = initialize_pool(ctx, 2)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "pool_already_initialized"
    assert "Pool already has 1 slot(s)" in outcome.message
    assert git.list_worktrees() == worktrees_before


def test_initialize_pool_invalid_size_below_min_returns_failure(tmp_path: Path) -> None:
    ctx, git = make_slots_lifecycle_context(tmp_path, branches=("main",))
    worktrees_before = git.list_worktrees()

    outcome = initialize_pool(ctx, 0)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_size"
    assert "between 1 and 99" in outcome.message
    assert git.list_worktrees() == worktrees_before


def test_initialize_pool_invalid_size_above_max_returns_failure(tmp_path: Path) -> None:
    ctx, git = make_slots_lifecycle_context(tmp_path, branches=("main",))
    worktrees_before = git.list_worktrees()

    outcome = initialize_pool(ctx, 100)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_size"
    assert git.list_worktrees() == worktrees_before


def test_resize_pool_grow_from_empty_creates_detached_worktrees(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(tmp_path, branches=("main",))

    outcome = resize_pool(ctx, 2)

    assert isinstance(outcome, SlotResizeOutcome)
    assert outcome.previous_pool_size == 0
    assert outcome.pool_size == 2
    assert outcome.created == ("slot-01", "slot-02")
    assert outcome.removed == ()
    assert outcome.worktrees_dir == ctx.repo.worktrees_dir
    worktrees = git.list_worktrees()
    assert len(worktrees) == 2
    assert worktrees[0].path == slot_path(slots_root, 1)
    assert worktrees[0].branch is None


def test_resize_pool_no_op_when_at_target(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(
            slot_worktree(slots_root, 1, None),
            slot_worktree(slots_root, 2, None),
        ),
    )
    worktrees_before = git.list_worktrees()

    outcome = resize_pool(ctx, 2)

    assert isinstance(outcome, SlotResizeOutcome)
    assert outcome.previous_pool_size == 2
    assert outcome.pool_size == 2
    assert outcome.created == ()
    assert outcome.removed == ()
    assert git.list_worktrees() == worktrees_before


def test_resize_pool_shrink_removes_highest_unassigned(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(
            slot_worktree(slots_root, 1, None),
            slot_worktree(slots_root, 2, None),
            slot_worktree(slots_root, 3, None),
            slot_worktree(slots_root, 4, None),
        ),
    )

    outcome = resize_pool(ctx, 2)

    assert isinstance(outcome, SlotResizeOutcome)
    assert outcome.previous_pool_size == 4
    assert outcome.pool_size == 2
    assert outcome.created == ()
    assert outcome.removed == ("slot-03", "slot-04")
    remaining_paths = {wt.path for wt in git.list_worktrees()}
    assert remaining_paths == {slot_path(slots_root, 1), slot_path(slots_root, 2)}


def test_resize_pool_shrink_blocks_when_slot_assigned(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(
            slot_worktree(slots_root, 1, None),
            slot_worktree(slots_root, 2, "feat/x"),
        ),
    )
    worktrees_before = git.list_worktrees()

    outcome = resize_pool(ctx, 1)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "resize_unsafe"
    assert "slot-02 is assigned to 'feat/x'" in outcome.message
    assert git.list_worktrees() == worktrees_before


def test_resize_pool_shrink_blocks_when_operation_in_progress(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    operation_path = slot_path(slots_root, 2)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/rebase"),
        worktrees=(
            slot_worktree(slots_root, 1, None),
            slot_worktree(slots_root, 2, None),
        ),
        operations_by_path={
            operation_path: WorktreeOccupancy(
                path=operation_path,
                branch="feat/rebase",
                operation="rebase",
            ),
        },
    )
    worktrees_before = git.list_worktrees()

    outcome = resize_pool(ctx, 1)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "resize_unsafe"
    assert "slot-02" in outcome.message
    assert "feat/rebase" in outcome.message
    assert "rebase" in outcome.message
    assert "git rebase" in outcome.message
    assert git.list_worktrees() == worktrees_before


def test_resize_pool_shrink_blocks_when_slot_dirty(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = slot_path(slots_root, 2)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(
            slot_worktree(slots_root, 1, None),
            slot_worktree(slots_root, 2, None),
        ),
        file_status_by_path={
            dirty_path: FileStatus(staged=False, modified=True, untracked=False),
        },
    )
    worktrees_before = git.list_worktrees()

    outcome = resize_pool(ctx, 1)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "resize_unsafe"
    assert f"slot-02 at {dirty_path} has uncommitted changes" in outcome.message
    assert git.list_worktrees() == worktrees_before


def test_resize_pool_shrink_assigned_takes_priority_over_dirty(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    contested_path = slot_path(slots_root, 2)
    ctx, _git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(
            slot_worktree(slots_root, 1, None),
            slot_worktree(slots_root, 2, "feat/x"),
        ),
        file_status_by_path={
            contested_path: FileStatus(staged=False, modified=True, untracked=False),
        },
    )

    outcome = resize_pool(ctx, 1)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "resize_unsafe"
    assert "slot-02 is assigned to 'feat/x'" in outcome.message
    assert "uncommitted changes" not in outcome.message


def test_resize_pool_invalid_size_below_min_returns_failure(tmp_path: Path) -> None:
    ctx, git = make_slots_lifecycle_context(tmp_path, branches=("main",))
    worktrees_before = git.list_worktrees()

    outcome = resize_pool(ctx, 0)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_size"
    assert git.list_worktrees() == worktrees_before


def test_resize_pool_invalid_size_above_max_returns_failure(tmp_path: Path) -> None:
    ctx, git = make_slots_lifecycle_context(tmp_path, branches=("main",))
    worktrees_before = git.list_worktrees()

    outcome = resize_pool(ctx, 100)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_size"
    assert git.list_worktrees() == worktrees_before


# --- free_slots ---


def test_free_slots_empty_list_is_no_op(tmp_path: Path) -> None:
    ctx, git = make_slots_lifecycle_context(tmp_path, branches=("main",))
    worktrees_before = git.list_worktrees()

    outcome = free_slots(ctx, ())

    assert isinstance(outcome, SlotFreeOutcome)
    assert outcome.freed == ()
    assert git.list_worktrees() == worktrees_before
    assert git._detach_head_calls == []


def test_free_slots_single_assigned_slot_detaches_at_trunk(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        trunk_branch="trunk",
    )
    path = slot_path(slots_root, 1)

    outcome = free_slots(ctx, ("slot-01",))

    assert isinstance(outcome, SlotFreeOutcome)
    assert len(outcome.freed) == 1
    freed = outcome.freed[0]
    assert freed.slot_name == "slot-01"
    assert freed.branch_name == "feat/x"
    assert freed.worktree_path == path
    assert git.get_current_branch(path) == DetachedHead()
    assert git._detach_head_calls == [(path, "trunk")]


def test_free_slots_batch_detaches_all_in_order(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/a", "feat/b", "feat/c"),
        worktrees=(
            slot_worktree(slots_root, 1, "feat/a"),
            slot_worktree(slots_root, 2, "feat/b"),
            slot_worktree(slots_root, 3, "feat/c"),
        ),
    )

    outcome = free_slots(ctx, ("slot-03", "slot-01"))

    assert isinstance(outcome, SlotFreeOutcome)
    assert [freed.slot_name for freed in outcome.freed] == ["slot-03", "slot-01"]
    assert [freed.branch_name for freed in outcome.freed] == ["feat/c", "feat/a"]
    assert git._detach_head_calls == [
        (slot_path(slots_root, 3), "main"),
        (slot_path(slots_root, 1), "main"),
    ]
    assert git.get_current_branch(slot_path(slots_root, 1)) == DetachedHead()
    assert git.get_current_branch(slot_path(slots_root, 2)) == "feat/b"
    assert git.get_current_branch(slot_path(slots_root, 3)) == DetachedHead()


def test_free_slots_unassigned_target_returns_invalid_slot_args(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(slot_worktree(slots_root, 1, None),),
    )

    outcome = free_slots(ctx, ("slot-01",))

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_slot_args"
    assert "slot-01 is not currently assigned" in outcome.message
    assert git._detach_head_calls == []


def test_free_slots_operation_target_returns_invalid_slot_args(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    operation_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/rebase"),
        worktrees=(slot_worktree(slots_root, 1, None),),
        operations_by_path={
            operation_path: WorktreeOccupancy(
                path=operation_path,
                branch="feat/rebase",
                operation="rebase",
            ),
        },
    )

    outcome = free_slots(ctx, ("slot-01",))

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_slot_args"
    assert "slot-01" in outcome.message
    assert "feat/rebase" in outcome.message
    assert "rebase" in outcome.message
    assert "git rebase" in outcome.message
    assert git._detach_head_calls == []


def test_free_slots_dirty_target_returns_invalid_slot_args(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        file_status_by_path={
            dirty_path: FileStatus(staged=False, modified=True, untracked=False),
        },
    )

    outcome = free_slots(ctx, ("slot-01",))

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_slot_args"
    assert f"slot-01 has uncommitted changes at {dirty_path}" in outcome.message
    assert git._detach_head_calls == []
    assert git.get_current_branch(dirty_path) == "feat/x"


def test_free_slots_preflight_blocks_all_when_one_dirty(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = slot_path(slots_root, 2)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/a", "feat/b"),
        worktrees=(
            slot_worktree(slots_root, 1, "feat/a"),
            slot_worktree(slots_root, 2, "feat/b"),
        ),
        file_status_by_path={
            dirty_path: FileStatus(staged=False, modified=True, untracked=False),
        },
    )

    outcome = free_slots(ctx, ("slot-01", "slot-02"))

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_slot_args"
    assert f"slot-02 has uncommitted changes at {dirty_path}" in outcome.message
    assert git._detach_head_calls == []
    assert git.get_current_branch(slot_path(slots_root, 1)) == "feat/a"
    assert git.get_current_branch(slot_path(slots_root, 2)) == "feat/b"


def test_free_slots_combines_selector_preflight_errors_with_state_errors(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(
            slot_worktree(slots_root, 1, "feat/x"),
            slot_worktree(slots_root, 2, None),
        ),
    )

    outcome = free_slots(
        ctx,
        ("slot-02",),
        preflight_errors=("--num must be in 1..2.", "bogus is not a valid slot name."),
    )

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_slot_args"
    assert outcome.message.splitlines() == [
        "--num must be in 1..2.",
        "bogus is not a valid slot name.",
        "slot-02 is not currently assigned. Run `slot list` to see the pool.",
    ]
    assert git._detach_head_calls == []


def test_free_slots_mid_loop_git_failure_reports_already_freed(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    first_path = slot_path(slots_root, 1)
    second_path = slot_path(slots_root, 2)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/a", "feat/b"),
        worktrees=(
            slot_worktree(slots_root, 1, "feat/a"),
            slot_worktree(slots_root, 2, "feat/b"),
        ),
        detach_head_failures_by_path={
            second_path: subprocess.CalledProcessError(
                128,
                ["git", "checkout", "--detach", "main"],
                stderr="fatal: reference is not a tree: main",
            ),
        },
    )

    outcome = free_slots(ctx, ("slot-01", "slot-02"))

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "slot_allocation_error"
    assert "Failed to detach slot-02" in outcome.message
    assert "reference is not a tree" in outcome.message
    assert outcome.message.endswith("Already freed: slot-01.")
    assert git._detach_head_calls == [(first_path, "main"), (second_path, "main")]
    assert git.get_current_branch(first_path) == DetachedHead()
    assert git.get_current_branch(second_path) == "feat/b"


def test_free_slots_mid_loop_first_failure_omits_already_freed(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    first_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/a"),
        worktrees=(slot_worktree(slots_root, 1, "feat/a"),),
        detach_head_failures_by_path={
            first_path: subprocess.CalledProcessError(
                128,
                ["git", "checkout", "--detach", "main"],
                stderr="fatal: boom",
            ),
        },
    )

    outcome = free_slots(ctx, ("slot-01",))

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "slot_allocation_error"
    assert "Failed to detach slot-01" in outcome.message
    assert "Already freed:" not in outcome.message
    assert git._detach_head_calls == [(first_path, "main")]
    assert git.get_current_branch(first_path) == "feat/a"


def test_plan_free_slots_validates_without_mutating(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        trunk_branch="trunk",
    )

    plan = plan_free_slots(ctx, ("slot-01",))

    assert isinstance(plan, SlotFreePlan)
    assert plan.trunk_branch == "trunk"
    assert len(plan.targets) == 1
    assert plan.targets[0].branch_name == "feat/x"
    assert git.get_current_branch(path) == "feat/x"
    assert git._detach_head_calls == []


def test_execute_free_plan_preserves_free_slots_behavior(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)

    outcome = execute_free_plan(ctx, plan)

    assert isinstance(outcome, SlotFreeOutcome)
    assert outcome.freed[0].branch_name == "feat/x"
    assert git.get_current_branch(path) == DetachedHead()
    assert git._detach_head_calls == [(path, "main")]


def test_all_cleanup_actions_are_in_fixed_order() -> None:
    assert SLOT_RELEASE_ALL_CLEANUP_ACTIONS == (
        "pr",
        "local_branch",
    )


def test_cleanup_planning_for_all_does_not_mutate(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    pr = FakePRGateway(prs_by_branch={"feat/x": make_pr(42, "OPEN", "feat/x")})
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        pr_gateway=pr,
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)

    cleanup = plan_release_cleanup(
        ctx,
        plan.targets,
        SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.action, entry.status, entry.pr_number) for entry in cleanup] == [
        ("pr", "planned", 42),
        ("local_branch", "planned", None),
    ]
    assert git._detach_head_calls == []
    assert git.delete_local_branch_calls == ()
    assert pr.close_calls == ()


def test_pr_cleanup_success_closes_open_pr_after_detach(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    pr = FakePRGateway(prs_by_branch={"feat/x": make_pr(42, "OPEN", "feat/x")})
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        pr_gateway=pr,
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)
    outcome = execute_free_plan(ctx, plan)
    assert isinstance(outcome, SlotFreeOutcome)

    cleanup = execute_release_cleanup(
        ctx,
        outcome.freed,
        ("pr",),
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.action, entry.status, entry.pr_number) for entry in cleanup] == [
        ("pr", "success", 42)
    ]
    assert git._detach_head_calls == [(slot_path(slots_root, 1), "main")]
    assert pr.close_calls == (42,)


def test_pr_cleanup_no_pr_is_skipped(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, _git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)

    cleanup = plan_release_cleanup(ctx, plan.targets, ("pr",), trunk_branch="main")

    assert cleanup[0].action == "pr"
    assert cleanup[0].status == "skipped"
    assert cleanup[0].message == "no matching PR"


def test_cleanup_all_with_pr_lookup_miss_continues_to_local_branch_cleanup(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)
    outcome = execute_free_plan(ctx, plan)
    assert isinstance(outcome, SlotFreeOutcome)

    cleanup = execute_release_cleanup(
        ctx,
        outcome.freed,
        ("pr", "local_branch"),
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.action, entry.status, entry.message) for entry in cleanup] == [
        ("pr", "skipped", "no matching PR"),
        ("local_branch", "success", None),
    ]
    assert git.delete_local_branch_calls == (("feat/x", True),)
    assert not git.branch_exists("feat/x")


@pytest.mark.parametrize("pr_state", ["CLOSED", "MERGED"])
def test_cleanup_all_with_completed_pr_continues_to_local_branch_cleanup(
    tmp_path: Path,
    pr_state: PRState,
) -> None:
    slots_root = tmp_path / "slots"
    pr = FakePRGateway(prs_by_branch={"feat/x": make_pr(42, pr_state, "feat/x")})
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        pr_gateway=pr,
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)
    outcome = execute_free_plan(ctx, plan)
    assert isinstance(outcome, SlotFreeOutcome)

    cleanup = execute_release_cleanup(
        ctx,
        outcome.freed,
        ("pr", "local_branch"),
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.action, entry.status) for entry in cleanup] == [
        ("pr", "skipped"),
        ("local_branch", "success"),
    ]
    assert git.delete_local_branch_calls == (("feat/x", True),)
    assert pr.close_calls == ()


def test_cleanup_all_with_pr_lookup_failure_stops_before_local_branch_cleanup(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    pr = FakePRGateway(lookup_failure=PRGatewayFailure(stderr="gh auth failed", returncode=4))
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        pr_gateway=pr,
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)
    outcome = execute_free_plan(ctx, plan)
    assert isinstance(outcome, SlotFreeOutcome)

    cleanup = execute_release_cleanup(
        ctx,
        outcome.freed,
        ("pr", "local_branch"),
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.action, entry.status, entry.message) for entry in cleanup] == [
        ("pr", "error", "gh auth failed")
    ]
    assert git.delete_local_branch_calls == ()
    assert git.branch_exists("feat/x")


def test_cleanup_all_with_pr_close_failure_stops_before_local_branch_cleanup(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    failure = PRGatewayFailure(stderr="gh auth failed", returncode=4)
    pr = FakePRGateway(
        prs_by_branch={"feat/x": make_pr(42, "OPEN", "feat/x")},
        close_failure=failure,
    )
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        pr_gateway=pr,
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)
    outcome = execute_free_plan(ctx, plan)
    assert isinstance(outcome, SlotFreeOutcome)

    cleanup = execute_release_cleanup(
        ctx,
        outcome.freed,
        ("pr", "local_branch"),
        trunk_branch="main",
    )

    assert [(entry.action, entry.status, entry.message) for entry in cleanup] == [
        ("pr", "error", "gh auth failed")
    ]
    assert pr.close_calls == (42,)
    assert git.delete_local_branch_calls == ()
    assert git.branch_exists("feat/x")


def test_local_branch_cleanup_force_deletes_after_detach(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)
    outcome = execute_free_plan(ctx, plan)
    assert isinstance(outcome, SlotFreeOutcome)

    cleanup = execute_release_cleanup(
        ctx,
        outcome.freed,
        ("local_branch",),
        trunk_branch=plan.trunk_branch,
    )

    assert cleanup[0].status == "success"
    assert git._detach_head_calls == [(slot_path(slots_root, 1), "main")]
    assert git.delete_local_branch_calls == (("feat/x", True),)
    assert not git.branch_exists("feat/x")


def test_local_branch_cleanup_skips_when_branch_is_already_absent(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)
    outcome = execute_free_plan(ctx, plan)
    assert isinstance(outcome, SlotFreeOutcome)

    cleanup = execute_release_cleanup(
        ctx,
        outcome.freed,
        ("local_branch",),
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.status, entry.message) for entry in cleanup] == [("skipped", "already absent")]
    assert git.delete_local_branch_calls == ()


def test_local_branch_cleanup_skips_narrow_missing_branch_race(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    failure = GitCommandFailure(message="error: branch 'feat/x' not found.", returncode=1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        delete_local_branch_failure_by_branch={"feat/x": failure},
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)
    outcome = execute_free_plan(ctx, plan)
    assert isinstance(outcome, SlotFreeOutcome)

    cleanup = execute_release_cleanup(
        ctx,
        outcome.freed,
        ("local_branch",),
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.status, entry.message) for entry in cleanup] == [("skipped", "already absent")]
    assert git.delete_local_branch_calls == (("feat/x", True),)


def test_local_branch_cleanup_unexpected_failure_is_error_and_preserves_branch(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    failure = GitCommandFailure(
        message="cannot delete branch 'feat/x' checked out at '/repo-other'",
        returncode=1,
    )
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        delete_local_branch_failure_by_branch={"feat/x": failure},
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)
    outcome = execute_free_plan(ctx, plan)
    assert isinstance(outcome, SlotFreeOutcome)

    cleanup = execute_release_cleanup(
        ctx,
        outcome.freed,
        ("local_branch",),
        trunk_branch="main",
    )

    assert cleanup[0].status == "error"
    assert cleanup[0].message == "cannot delete branch 'feat/x' checked out at '/repo-other'"
    assert git.delete_local_branch_calls == (("feat/x", True),)
    assert git.branch_exists("feat/x")


def test_trunk_branch_cleanup_is_refused(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(slot_worktree(slots_root, 1, "main"),),
        trunk_branch="main",
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)

    cleanup = plan_release_cleanup(
        ctx,
        plan.targets,
        ("local_branch",),
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.action, entry.status, entry.message) for entry in cleanup] == [
        ("local_branch", "error", "refusing to delete trunk branch main")
    ]
    assert git.delete_local_branch_calls == ()


# --- release workflows ---


def test_plan_free_release_includes_cleanup_preview_without_mutating(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    pr = FakePRGateway(prs_by_branch={"feat/x": make_pr(42, "OPEN", "feat/x")})
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        pr_gateway=pr,
    )

    preview = plan_free_release(
        ctx,
        ("slot-01",),
        cleanup_actions=SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
    )

    assert isinstance(preview, SlotFreeReleasePreview)
    assert [(entry.action, entry.status, entry.pr_number) for entry in preview.cleanup] == [
        ("pr", "planned", 42),
        ("local_branch", "planned", None),
    ]
    assert git._detach_head_calls == []
    assert git.delete_local_branch_calls == ()
    assert pr.close_calls == ()


def test_execute_free_release_detaches_then_runs_cleanup(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    pr = FakePRGateway(prs_by_branch={"feat/x": make_pr(42, "OPEN", "feat/x")})
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        pr_gateway=pr,
    )
    preview = plan_free_release(
        ctx,
        ("slot-01",),
        cleanup_actions=SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
    )
    assert isinstance(preview, SlotFreeReleasePreview)

    execution = execute_free_release(
        ctx,
        preview,
        cleanup_actions=SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
    )

    assert isinstance(execution, SlotFreeReleaseExecution)
    assert [freed.slot_name for freed in execution.outcome.freed] == ["slot-01"]
    assert [(entry.action, entry.status, entry.pr_number) for entry in execution.cleanup] == [
        ("pr", "success", 42),
        ("local_branch", "success", None),
    ]
    assert git._detach_head_calls == [(slot_path(slots_root, 1), "main")]
    assert git.delete_local_branch_calls == (("feat/x", True),)
    assert pr.close_calls == (42,)


def test_execute_free_release_stops_before_cleanup_when_detach_fails(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    worktree_path = slot_path(slots_root, 1)
    pr = FakePRGateway(prs_by_branch={"feat/x": make_pr(42, "OPEN", "feat/x")})
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        detach_head_failures_by_path={
            worktree_path: subprocess.CalledProcessError(
                128,
                ["git", "checkout", "--detach", "main"],
                stderr="fatal: reference is not a tree: main",
            ),
        },
        pr_gateway=pr,
    )
    preview = plan_free_release(
        ctx,
        ("slot-01",),
        cleanup_actions=SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
    )
    assert isinstance(preview, SlotFreeReleasePreview)

    execution = execute_free_release(
        ctx,
        preview,
        cleanup_actions=SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
    )

    assert isinstance(execution, SlotLifecycleFailure)
    assert execution.error_type == "slot_allocation_error"
    assert "Failed to detach slot-01" in execution.message
    assert git._detach_head_calls == [(worktree_path, "main")]
    assert git.delete_local_branch_calls == ()
    assert pr.close_calls == ()
    assert git.branch_exists("feat/x")


def test_execute_free_release_mid_loop_failure_preserves_partial_message(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    first_path = slot_path(slots_root, 1)
    second_path = slot_path(slots_root, 2)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/a", "feat/b"),
        worktrees=(
            slot_worktree(slots_root, 1, "feat/a"),
            slot_worktree(slots_root, 2, "feat/b"),
        ),
        detach_head_failures_by_path={
            second_path: subprocess.CalledProcessError(
                128,
                ["git", "checkout", "--detach", "main"],
                stderr="fatal: reference is not a tree: main",
            ),
        },
    )
    preview = plan_free_release(ctx, ("slot-01", "slot-02"), cleanup_actions=("local_branch",))
    assert isinstance(preview, SlotFreeReleasePreview)

    execution = execute_free_release(ctx, preview, cleanup_actions=("local_branch",))

    assert isinstance(execution, SlotLifecycleFailure)
    assert execution.message.endswith("Already freed: slot-01.")
    assert git._detach_head_calls == [(first_path, "main"), (second_path, "main")]
    assert git.delete_local_branch_calls == ()
    assert git.get_current_branch(first_path) == DetachedHead()
    assert git.get_current_branch(second_path) == "feat/b"


def test_plan_gc_release_returns_preview_outcome_with_cleanup_without_mutating(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/done"),
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )

    preview = plan_gc_release(ctx, cleanup_actions=("local_branch",))

    assert isinstance(preview, SlotGcReleasePreview)
    assert preview.outcome.dry_run is True
    assert [entry.action for entry in preview.outcome.entries] == ["would_free"]
    assert [(entry.action, entry.status) for entry in preview.outcome.entries[0].cleanup] == [
        ("local_branch", "planned")
    ]
    assert git._detach_head_calls == []
    assert git.delete_local_branch_calls == ()
    assert git.branch_exists("feat/done")


def test_execute_gc_release_frees_would_free_entries_and_attaches_cleanup(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/done"),
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )
    preview = plan_gc_release(ctx, cleanup_actions=("local_branch",))
    assert isinstance(preview, SlotGcReleasePreview)

    outcome = execute_gc_release(ctx, preview, cleanup_actions=("local_branch",))

    assert [entry.action for entry in outcome.entries] == ["freed"]
    assert [(entry.action, entry.status) for entry in outcome.entries[0].cleanup] == [
        ("local_branch", "success")
    ]
    assert outcome.cleanup_error_count == 0
    assert git._detach_head_calls == [(slot_path(slots_root, 1), "main")]
    assert git.delete_local_branch_calls == (("feat/done", True),)
    assert not git.branch_exists("feat/done")


def test_execute_gc_release_preserves_dirty_recheck_semantics(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    worktree_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/done"),
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )
    preview = plan_gc_release(ctx, cleanup_actions=("local_branch",))
    assert isinstance(preview, SlotGcReleasePreview)
    git._file_status_by_path[worktree_path] = FileStatus(False, True, False)

    outcome = execute_gc_release(ctx, preview, cleanup_actions=("local_branch",))

    assert [entry.action for entry in outcome.entries] == ["skipped_dirty"]
    assert outcome.skipped_count == 1
    assert git._detach_head_calls == []
    assert git.delete_local_branch_calls == ()


def test_execute_gc_release_preserves_operation_recheck_semantics(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    operation_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )
    preview = plan_gc_release(ctx, cleanup_actions=("local_branch",))
    assert isinstance(preview, SlotGcReleasePreview)
    git._worktrees = [WorktreeInfo(path=operation_path, branch=None, is_bare=False)]
    git._operations_by_path[operation_path] = WorktreeOccupancy(
        path=operation_path,
        branch="feat/done",
        operation="bisect",
    )

    outcome = execute_gc_release(ctx, preview, cleanup_actions=("local_branch",))

    assert [entry.action for entry in outcome.entries] == ["skipped_operation"]
    assert outcome.skipped_count == 1
    assert "bisect" in (outcome.entries[0].message or "")
    assert git._detach_head_calls == []
    assert git.delete_local_branch_calls == ()


def test_plan_gc_release_surfaces_pool_empty_failure(tmp_path: Path) -> None:
    ctx, git = make_slots_lifecycle_context(tmp_path)

    preview = plan_gc_release(ctx, cleanup_actions=("local_branch",))

    assert isinstance(preview, SlotLifecycleFailure)
    assert preview.error_type == "pool_empty"
    assert git._detach_head_calls == []


# --- slot GC ---


def test_plan_gc_empty_pool_returns_lifecycle_failure(tmp_path: Path) -> None:
    ctx, git = make_slots_lifecycle_context(tmp_path)

    plan = plan_gc(ctx)

    assert isinstance(plan, SlotLifecycleFailure)
    assert plan.error_type == "pool_empty"
    assert "slot init --size N" in plan.message
    assert git._detach_head_calls == []


def test_garbage_collect_slots_empty_pool_returns_lifecycle_failure(tmp_path: Path) -> None:
    ctx, _git = make_slots_lifecycle_context(tmp_path)

    outcome = garbage_collect_slots(ctx, dry_run=False)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "pool_empty"


def test_garbage_collect_slots_detached_slots_are_ignored(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, None),),
    )

    outcome = garbage_collect_slots(ctx, dry_run=False)

    assert isinstance(outcome, SlotGcOutcome)
    assert outcome.entries == ()
    assert outcome.freed_count == 0
    assert outcome.kept_count == 0
    assert outcome.skipped_count == 0
    assert outcome.error_count == 0
    assert outcome.dry_run is False
    assert git._detach_head_calls == []


def test_garbage_collect_slots_open_pr_is_kept(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        prs_by_branch={"feat/x": make_pr(42, "OPEN", "feat/x")},
    )

    outcome = garbage_collect_slots(ctx, dry_run=False)

    assert isinstance(outcome, SlotGcOutcome)
    assert len(outcome.entries) == 1
    entry = outcome.entries[0]
    assert entry.action == "kept_open_pr"
    assert entry.pr_state == "OPEN"
    assert entry.pr_number == 42
    assert outcome.kept_count == 1
    assert git._detach_head_calls == []


@pytest.mark.parametrize("pr_state", ["MERGED", "CLOSED"])
def test_garbage_collect_slots_completed_pr_is_freed(
    tmp_path: Path,
    pr_state: PRState,
) -> None:
    slots_root = tmp_path / "slots"
    worktree_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, pr_state, "feat/done")},
    )

    outcome = garbage_collect_slots(ctx, dry_run=False)

    assert isinstance(outcome, SlotGcOutcome)
    assert [entry.action for entry in outcome.entries] == ["freed"]
    assert outcome.entries[0].pr_state == pr_state
    assert outcome.freed_count == 1
    assert git._detach_head_calls == [(worktree_path, "main")]
    assert git._create_branch_calls == []
    assert git._checkout_calls == []


def test_garbage_collect_slots_no_pr_is_kept(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "local-only"),),
        prs_by_branch={},
    )

    outcome = garbage_collect_slots(ctx, dry_run=False)

    assert isinstance(outcome, SlotGcOutcome)
    assert [entry.action for entry in outcome.entries] == ["kept_no_pr"]
    assert outcome.entries[0].pr_number is None
    assert outcome.kept_count == 1
    assert git._detach_head_calls == []


def test_garbage_collect_slots_broken_pr_lookup_yields_error_entry(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        pr_gateway=FakePRGateway(
            lookup_failure=PRGatewayFailure(stderr="gh: command not found", returncode=4)
        ),
    )

    outcome = garbage_collect_slots(ctx, dry_run=False)

    assert isinstance(outcome, SlotGcOutcome)
    assert [entry.action for entry in outcome.entries] == ["error"]
    assert outcome.error_count == 1
    assert "gh: command not found" in (outcome.entries[0].message or "")
    assert git._detach_head_calls == []


def test_garbage_collect_slots_operation_worktree_is_skipped(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    operation_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, None),),
        operations_by_path={
            operation_path: WorktreeOccupancy(
                path=operation_path,
                branch="feat/rebase",
                operation="rebase",
            ),
        },
        prs_by_branch={"feat/rebase": make_pr(12, "MERGED", "feat/rebase")},
    )

    outcome = garbage_collect_slots(ctx, dry_run=False)

    assert isinstance(outcome, SlotGcOutcome)
    assert [entry.action for entry in outcome.entries] == ["skipped_operation"]
    assert outcome.entries[0].branch_name == "feat/rebase"
    assert "rebase" in (outcome.entries[0].message or "")
    assert outcome.skipped_count == 1
    assert outcome.freed_count == 0
    assert git._detach_head_calls == []


def test_garbage_collect_slots_dirty_worktree_is_skipped(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    worktree_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/dirty"),),
        file_status_by_path={
            worktree_path: FileStatus(staged=False, modified=True, untracked=False),
        },
        prs_by_branch={"feat/dirty": make_pr(12, "MERGED", "feat/dirty")},
    )

    outcome = garbage_collect_slots(ctx, dry_run=False)

    assert isinstance(outcome, SlotGcOutcome)
    assert [entry.action for entry in outcome.entries] == ["skipped_dirty"]
    assert outcome.skipped_count == 1
    assert git._detach_head_calls == []


def test_garbage_collect_slots_dry_run_reports_without_mutating(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )

    outcome = garbage_collect_slots(ctx, dry_run=True)

    assert isinstance(outcome, SlotGcOutcome)
    assert [entry.action for entry in outcome.entries] == ["would_free"]
    assert outcome.freed_count == 1
    assert outcome.dry_run is True
    assert git._checkout_calls == []
    assert git._create_branch_calls == []
    assert git._detach_head_calls == []


def test_garbage_collect_slots_mixed_pool_classifies_per_slot(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(
            slot_worktree(slots_root, 1, "feat/done"),
            slot_worktree(slots_root, 2, "feat/wip"),
            slot_worktree(slots_root, 3, "local"),
            slot_worktree(slots_root, 4, "feat/dirty"),
            slot_worktree(slots_root, 5, None),
        ),
        file_status_by_path={
            slot_path(slots_root, 4): FileStatus(
                staged=False,
                modified=True,
                untracked=False,
            ),
        },
        prs_by_branch={
            "feat/done": make_pr(1, "MERGED", "feat/done"),
            "feat/wip": make_pr(2, "OPEN", "feat/wip"),
            "feat/dirty": make_pr(3, "MERGED", "feat/dirty"),
        },
    )

    outcome = garbage_collect_slots(ctx, dry_run=False)

    assert isinstance(outcome, SlotGcOutcome)
    actions_by_slot = {entry.slot_name: entry.action for entry in outcome.entries}
    assert actions_by_slot == {
        "slot-01": "freed",
        "slot-02": "kept_open_pr",
        "slot-03": "kept_no_pr",
        "slot-04": "skipped_dirty",
    }
    assert outcome.freed_count == 1
    assert outcome.kept_count == 2
    assert outcome.skipped_count == 1
    assert outcome.error_count == 0
    assert git._detach_head_calls == [(slot_path(slots_root, 1), "main")]


def test_plan_gc_classifies_without_mutating_state(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(
            slot_worktree(slots_root, 1, "feat/done"),
            slot_worktree(slots_root, 2, "feat/wip"),
            slot_worktree(slots_root, 3, "local"),
        ),
        prs_by_branch={
            "feat/done": make_pr(1, "MERGED", "feat/done"),
            "feat/wip": make_pr(2, "OPEN", "feat/wip"),
        },
    )

    plan = plan_gc(ctx)

    assert not isinstance(plan, SlotLifecycleFailure)
    actions_by_slot = {entry.slot_name: entry.action for entry in plan.entries}
    assert actions_by_slot == {
        "slot-01": "would_free",
        "slot-02": "kept_open_pr",
        "slot-03": "kept_no_pr",
    }
    assert plan.would_free_count == 1
    assert git._detach_head_calls == []


def test_plan_gc_dirty_worktree_still_classified_as_would_free(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    worktree_path = slot_path(slots_root, 1)
    ctx, _git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/dirty"),),
        file_status_by_path={
            worktree_path: FileStatus(staged=False, modified=True, untracked=False),
        },
        prs_by_branch={"feat/dirty": make_pr(12, "MERGED", "feat/dirty")},
    )

    plan = plan_gc(ctx)

    assert not isinstance(plan, SlotLifecycleFailure)
    assert [entry.action for entry in plan.entries] == ["would_free"]
    assert plan.would_free_count == 1


def test_outcome_from_gc_plan_preserves_dry_run_tally_semantics(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, _git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )
    plan = plan_gc(ctx)
    assert not isinstance(plan, SlotLifecycleFailure)

    outcome = outcome_from_gc_plan(plan, dry_run=True)

    assert [entry.action for entry in outcome.entries] == ["would_free"]
    assert outcome.freed_count == 1
    assert outcome.dry_run is True


def test_plan_gc_cleanup_is_explicit_and_outcome_attachment_is_pure(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/done"),
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )
    plan = plan_gc(ctx)
    assert not isinstance(plan, SlotLifecycleFailure)

    cleanup = plan_gc_cleanup(ctx, plan, ("local_branch",))
    outcome = outcome_from_gc_plan(plan, dry_run=True, cleanup=cleanup)

    assert [(entry.action, entry.status) for entry in outcome.entries[0].cleanup] == [
        ("local_branch", "planned")
    ]
    assert outcome.cleanup_error_count == 0
    assert git._detach_head_calls == []
    assert git.delete_local_branch_calls == ()
    assert git.branch_exists("feat/done")


def test_execute_gc_plan_frees_would_free_entries(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )

    plan = plan_gc(ctx)
    assert not isinstance(plan, SlotLifecycleFailure)
    outcome = execute_gc_plan(ctx, plan)

    assert [entry.action for entry in outcome.entries] == ["freed"]
    assert outcome.freed_count == 1
    assert outcome.dry_run is False
    assert git._detach_head_calls == [(slot_path(slots_root, 1), "main")]


def test_execute_gc_plan_passthrough_non_would_free(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 2, "feat/wip"),),
        prs_by_branch={"feat/wip": make_pr(2, "OPEN", "feat/wip")},
    )

    plan = plan_gc(ctx)
    assert not isinstance(plan, SlotLifecycleFailure)
    outcome = execute_gc_plan(ctx, plan)

    assert [entry.action for entry in outcome.entries] == ["kept_open_pr"]
    assert outcome.kept_count == 1
    assert outcome.freed_count == 0
    assert git._detach_head_calls == []


def test_execute_gc_plan_translates_dirty_to_skipped(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    worktree_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/dirty"),),
        file_status_by_path={
            worktree_path: FileStatus(staged=False, modified=True, untracked=False),
        },
        prs_by_branch={"feat/dirty": make_pr(12, "MERGED", "feat/dirty")},
    )

    plan = plan_gc(ctx)
    assert not isinstance(plan, SlotLifecycleFailure)
    assert [entry.action for entry in plan.entries] == ["would_free"]

    outcome = execute_gc_plan(ctx, plan)

    assert [entry.action for entry in outcome.entries] == ["skipped_dirty"]
    assert outcome.skipped_count == 1
    assert git._detach_head_calls == []


def test_execute_gc_plan_translates_new_operation_to_skipped(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    operation_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )

    plan = plan_gc(ctx)
    assert not isinstance(plan, SlotLifecycleFailure)
    git._worktrees = [WorktreeInfo(path=operation_path, branch=None, is_bare=False)]
    git._operations_by_path[operation_path] = WorktreeOccupancy(
        path=operation_path,
        branch="feat/done",
        operation="bisect",
    )

    outcome = execute_gc_plan(ctx, plan)

    assert [entry.action for entry in outcome.entries] == ["skipped_operation"]
    assert outcome.skipped_count == 1
    assert "bisect" in (outcome.entries[0].message or "")
    assert git._detach_head_calls == []


def test_execute_gc_plan_record_disappears_yields_error(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )

    plan = plan_gc(ctx)
    assert not isinstance(plan, SlotLifecycleFailure)
    git._worktrees.clear()

    outcome = execute_gc_plan(ctx, plan)

    assert [entry.action for entry in outcome.entries] == ["error"]
    assert outcome.error_count == 1
    assert "state changed between plan and execute" in (outcome.entries[0].message or "")
    assert git._detach_head_calls == []
