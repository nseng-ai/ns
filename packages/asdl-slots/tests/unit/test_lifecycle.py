from __future__ import annotations

from pathlib import Path

from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, FileStatus, WorktreeInfo
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.gateway.testing.storage import FakeSlotsStorageGateway
from asdl_slots.inventory import SlotInventory, SlotRecord
from asdl_slots.lifecycle import (
    SlotCheckoutOutcome,
    SlotInitOutcome,
    SlotLifecycleFailure,
    SlotResizeOutcome,
    build_init_plan,
    build_resize_plan,
    checkout_branch,
    checkout_current,
    initialize_pool,
    resize_pool,
)
from asdl_slots.repo_context import RepoContext


def _record(n: int, branch: str | None = None) -> SlotRecord:
    return SlotRecord(
        slot_name=f"slot-{n:02d}",
        slot_number=n,
        path=Path(f"/wt/slot-{n:02d}"),
        branch=branch,
    )


def _inventory(*records: SlotRecord) -> SlotInventory:
    return SlotInventory(records=tuple(sorted(records, key=lambda r: r.slot_number)))


def _slot_path(slots_root: Path, n: int) -> Path:
    return slots_root / "repos" / "repo" / "worktrees" / f"slot-{n:02d}"


def _slot_worktree(slots_root: Path, n: int, branch: str | None) -> WorktreeInfo:
    return WorktreeInfo(path=_slot_path(slots_root, n), branch=branch, is_bare=False)


def _lifecycle_context(
    tmp_path: Path,
    *,
    branches: tuple[str, ...] = (),
    worktrees: tuple[WorktreeInfo, ...] = (),
    previous_branch_by_path: dict[Path, str | None] | None = None,
    trunk_branch: str = "main",
    file_status_by_path: dict[Path, FileStatus] | None = None,
) -> tuple[SlotsCliContext, FakeGitGateway]:
    repo_root = (tmp_path / "repo").resolve()
    slots_root = tmp_path / "slots"
    repo_dir = slots_root / "repos" / "repo"
    repo = RepoContext(
        root=repo_root,
        main_repo_root=repo_root,
        repo_name="repo",
        repo_dir=repo_dir,
        worktrees_dir=repo_dir / "worktrees",
    )
    current_branch_by_path: dict[Path, str | DetachedHead] = {
        wt.path: wt.branch if wt.branch is not None else DetachedHead() for wt in worktrees
    }
    existing_paths = {repo_root, *(wt.path for wt in worktrees)}
    storage = FakeSlotsStorageGateway(existing_paths=existing_paths)
    git = FakeGitGateway(
        repo_root=repo_root,
        branches=branches,
        worktrees=worktrees,
        current_branch_by_path=current_branch_by_path,
        previous_branch_by_path=previous_branch_by_path,
        trunk_branch=trunk_branch,
        file_status_by_path=file_status_by_path,
        existing_paths=existing_paths,
        repository_root_by_cwd={repo_root: repo_root},
    )
    return (
        SlotsCliContext(
            repo=repo,
            git=git,
            storage=storage,
            clipboard=FakeClipboardGateway(),
            pr=FakePRGateway(),
            slots_root=slots_root,
        ),
        git,
    )


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
    ctx, git = _lifecycle_context(
        tmp_path,
        branches=("feat/x",),
        worktrees=(
            _slot_worktree(slots_root, 1, None),
            _slot_worktree(slots_root, 2, None),
        ),
    )

    outcome = checkout_branch(ctx, "feat/x", new_branch=False, base=None)

    assert isinstance(outcome, SlotCheckoutOutcome)
    assert outcome.slot_name == "slot-01"
    assert outcome.branch_name == "feat/x"
    assert outcome.worktree_path == _slot_path(slots_root, 1)
    assert outcome.already_assigned is False
    assert outcome.created_branch is False
    assert outcome.current_wt_note is None
    assert git.get_current_branch(_slot_path(slots_root, 1)) == "feat/x"
    assert ctx.storage.path_exists(ctx.repo.repo_dir)
    assert ctx.storage.path_exists(ctx.repo.worktrees_dir)


def test_checkout_branch_new_creates_branch_before_assigning(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = _lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(_slot_worktree(slots_root, 1, None),),
    )

    outcome = checkout_branch(ctx, "feat/new", new_branch=True, base="main")

    assert isinstance(outcome, SlotCheckoutOutcome)
    assert git.branch_exists("feat/new")
    assert outcome.slot_name == "slot-01"
    assert outcome.branch_name == "feat/new"
    assert outcome.created_branch is True
    assert git.get_current_branch(_slot_path(slots_root, 1)) == "feat/new"


def test_checkout_branch_pool_full_returns_failure_without_checkout(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    assigned = _slot_worktree(slots_root, 1, "feat/a")
    ctx, git = _lifecycle_context(
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
    assert git.get_current_branch(_slot_path(slots_root, 1)) == "feat/a"


def test_checkout_current_preserves_existing_redirect_behavior(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    repo_root = (tmp_path / "repo").resolve()
    ctx, git = _lifecycle_context(
        tmp_path,
        branches=("feat/x", "some-other"),
        worktrees=(
            WorktreeInfo(path=repo_root, branch="feat/x", is_bare=False),
            _slot_worktree(slots_root, 1, None),
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
    assert git.get_current_branch(_slot_path(slots_root, 1)) == "feat/x"


def test_initialize_pool_creates_n_detached_worktrees_at_trunk(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = _lifecycle_context(tmp_path, branches=("main",))

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
        assert wt.path == _slot_path(slots_root, n)
        assert wt.branch is None


def test_initialize_pool_with_existing_pool_returns_failure(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = _lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(_slot_worktree(slots_root, 1, None),),
    )
    worktrees_before = git.list_worktrees()

    outcome = initialize_pool(ctx, 2)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "pool_already_initialized"
    assert "Pool already has 1 slot(s)" in outcome.message
    assert git.list_worktrees() == worktrees_before


def test_initialize_pool_invalid_size_below_min_returns_failure(tmp_path: Path) -> None:
    ctx, git = _lifecycle_context(tmp_path, branches=("main",))
    worktrees_before = git.list_worktrees()

    outcome = initialize_pool(ctx, 0)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_size"
    assert "between 1 and 99" in outcome.message
    assert git.list_worktrees() == worktrees_before


def test_initialize_pool_invalid_size_above_max_returns_failure(tmp_path: Path) -> None:
    ctx, git = _lifecycle_context(tmp_path, branches=("main",))
    worktrees_before = git.list_worktrees()

    outcome = initialize_pool(ctx, 100)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_size"
    assert git.list_worktrees() == worktrees_before


def test_resize_pool_grow_from_empty_creates_detached_worktrees(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = _lifecycle_context(tmp_path, branches=("main",))

    outcome = resize_pool(ctx, 2)

    assert isinstance(outcome, SlotResizeOutcome)
    assert outcome.previous_pool_size == 0
    assert outcome.pool_size == 2
    assert outcome.created == ("slot-01", "slot-02")
    assert outcome.removed == ()
    assert outcome.worktrees_dir == ctx.repo.worktrees_dir
    worktrees = git.list_worktrees()
    assert len(worktrees) == 2
    assert worktrees[0].path == _slot_path(slots_root, 1)
    assert worktrees[0].branch is None


def test_resize_pool_no_op_when_at_target(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = _lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(
            _slot_worktree(slots_root, 1, None),
            _slot_worktree(slots_root, 2, None),
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
    ctx, git = _lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(
            _slot_worktree(slots_root, 1, None),
            _slot_worktree(slots_root, 2, None),
            _slot_worktree(slots_root, 3, None),
            _slot_worktree(slots_root, 4, None),
        ),
    )

    outcome = resize_pool(ctx, 2)

    assert isinstance(outcome, SlotResizeOutcome)
    assert outcome.previous_pool_size == 4
    assert outcome.pool_size == 2
    assert outcome.created == ()
    assert outcome.removed == ("slot-03", "slot-04")
    remaining_paths = {wt.path for wt in git.list_worktrees()}
    assert remaining_paths == {_slot_path(slots_root, 1), _slot_path(slots_root, 2)}


def test_resize_pool_shrink_blocks_when_slot_assigned(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = _lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(
            _slot_worktree(slots_root, 1, None),
            _slot_worktree(slots_root, 2, "feat/x"),
        ),
    )
    worktrees_before = git.list_worktrees()

    outcome = resize_pool(ctx, 1)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "resize_unsafe"
    assert "slot-02 is assigned to 'feat/x'" in outcome.message
    assert git.list_worktrees() == worktrees_before


def test_resize_pool_shrink_blocks_when_slot_dirty(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = _slot_path(slots_root, 2)
    ctx, git = _lifecycle_context(
        tmp_path,
        branches=("main",),
        worktrees=(
            _slot_worktree(slots_root, 1, None),
            _slot_worktree(slots_root, 2, None),
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
    contested_path = _slot_path(slots_root, 2)
    ctx, _git = _lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(
            _slot_worktree(slots_root, 1, None),
            _slot_worktree(slots_root, 2, "feat/x"),
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
    ctx, git = _lifecycle_context(tmp_path, branches=("main",))
    worktrees_before = git.list_worktrees()

    outcome = resize_pool(ctx, 0)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_size"
    assert git.list_worktrees() == worktrees_before


def test_resize_pool_invalid_size_above_max_returns_failure(tmp_path: Path) -> None:
    ctx, git = _lifecycle_context(tmp_path, branches=("main",))
    worktrees_before = git.list_worktrees()

    outcome = resize_pool(ctx, 100)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "invalid_size"
    assert git.list_worktrees() == worktrees_before
