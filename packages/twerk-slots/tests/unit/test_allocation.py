from __future__ import annotations

from pathlib import Path

import pytest

from twerk_core.git.types import (
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    WorktreeInfo,
)
from twerk_slots.allocation import (
    PoolFullError,
    SlotAllocationError,
    SlotAllocationResult,
    allocate_slot_for_branch,
    find_branch_assignment,
    find_inactive_slot,
    find_next_available_slot,
    find_oldest_assignment,
    sync_pool_assignments,
)
from twerk_slots.context_testing import build_test_slots_context
from twerk_slots.gateway.testing import (
    FakeGitGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)
from twerk_slots.pool_state import PoolState, SlotAssignment
from twerk_slots.repo_context import RepoContext

ROOT = Path("/tmp/t")


def _make_repo() -> RepoContext:
    repo_root = ROOT / "repo"
    repo_dir = ROOT / "slots" / "repos" / "repo"
    worktrees_dir = repo_dir / "worktrees"
    return RepoContext(
        root=repo_root,
        main_repo_root=repo_root,
        repo_name="repo",
        repo_dir=repo_dir,
        worktrees_dir=worktrees_dir,
        pool_json_path=repo_dir / "pool.json",
    )


def _seeded_storage(*, existing_paths: set[Path] | None = None) -> FakeSlotsStorageGateway:
    repo = _make_repo()
    base = {repo.root, repo.repo_dir, repo.worktrees_dir}
    if existing_paths:
        base |= existing_paths
    return FakeSlotsStorageGateway(existing_paths=base)


NOW = "2026-04-12T00:00:00+00:00"
EARLIER = "2026-04-01T00:00:00+00:00"


# -- find_* unit helpers -----------------------------------------------------


def test_find_next_available_slot_empty() -> None:
    state = PoolState(pool_size=4, assignments=())
    storage = FakeSlotsStorageGateway()
    assert find_next_available_slot(state, storage, Path("/wt")) == 1


def test_find_next_available_slot_skips_assigned() -> None:
    state = PoolState(
        pool_size=4,
        assignments=(
            SlotAssignment("slot-01", "feat/a", NOW, Path("/wt/slot-01")),
            SlotAssignment("slot-02", "feat/b", NOW, Path("/wt/slot-02")),
        ),
    )
    storage = FakeSlotsStorageGateway()
    assert find_next_available_slot(state, storage, Path("/wt")) == 3


def test_find_next_available_slot_skips_disk_directories() -> None:
    state = PoolState(pool_size=3, assignments=())
    wt_dir = Path("/wt")
    storage = FakeSlotsStorageGateway(existing_paths={wt_dir / "slot-01"})
    assert find_next_available_slot(state, storage, wt_dir) == 2


def test_find_next_available_slot_full_pool() -> None:
    state = PoolState(
        pool_size=2,
        assignments=(
            SlotAssignment("slot-01", "a", NOW, Path("/wt/slot-01")),
            SlotAssignment("slot-02", "b", NOW, Path("/wt/slot-02")),
        ),
    )
    storage = FakeSlotsStorageGateway()
    assert find_next_available_slot(state, storage, Path("/wt")) is None


def test_find_branch_assignment() -> None:
    a = SlotAssignment("slot-01", "feat/x", NOW, Path("/wt/slot-01"))
    state = PoolState(pool_size=4, assignments=(a,))
    assert find_branch_assignment(state, "feat/x") is a
    assert find_branch_assignment(state, "other") is None


def test_find_oldest_assignment_picks_earliest() -> None:
    old = SlotAssignment("slot-01", "a", EARLIER, Path("/wt/slot-01"))
    new = SlotAssignment("slot-02", "b", NOW, Path("/wt/slot-02"))
    state = PoolState(pool_size=4, assignments=(new, old))
    assert find_oldest_assignment(state) is old


def test_find_oldest_assignment_empty() -> None:
    assert find_oldest_assignment(PoolState(pool_size=4, assignments=())) is None


# -- find_inactive_slot ------------------------------------------------------


def test_find_inactive_slot_reuses_clean_worktree() -> None:
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    git = FakeGitGateway(
        repo_root=repo.root,
        worktrees=(WorktreeInfo(path=slot_path, branch="__slot-01-br-stub__", is_bare=False),),
    )
    state = PoolState(pool_size=4, assignments=())

    result = find_inactive_slot(state, git)

    assert result == ("slot-01", slot_path)


def test_find_inactive_slot_skips_dirty_worktree() -> None:
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    git = FakeGitGateway(
        repo_root=repo.root,
        worktrees=(WorktreeInfo(path=slot_path, branch="feat/x", is_bare=False),),
        file_status_by_path={slot_path: FileStatus(False, True, False)},
    )
    state = PoolState(pool_size=4, assignments=())

    assert find_inactive_slot(state, git) is None


def test_find_inactive_slot_skips_assigned_worktree() -> None:
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    git = FakeGitGateway(
        repo_root=repo.root,
        worktrees=(WorktreeInfo(path=slot_path, branch="feat/x", is_bare=False),),
    )
    state = PoolState(
        pool_size=4,
        assignments=(SlotAssignment("slot-01", "feat/x", NOW, slot_path),),
    )

    assert find_inactive_slot(state, git) is None


# -- sync_pool_assignments ---------------------------------------------------


def test_sync_returns_same_state_when_all_match() -> None:
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    state = PoolState(
        pool_size=4,
        assignments=(SlotAssignment("slot-01", "feat/x", NOW, slot_path),),
    )
    git = FakeGitGateway(
        repo_root=repo.root,
        current_branch_by_path={slot_path: "feat/x"},
    )
    storage = _seeded_storage(existing_paths={slot_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path)

    result = sync_pool_assignments(state, git, storage, pool_state_gw)

    assert result == state
    assert pool_state_gw._save_calls == []  # no write when nothing changed


def test_sync_updates_and_persists_when_branch_differs() -> None:
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    state = PoolState(
        pool_size=4,
        assignments=(SlotAssignment("slot-01", "feat/x", EARLIER, slot_path),),
    )
    git = FakeGitGateway(
        repo_root=repo.root,
        current_branch_by_path={slot_path: "feat/new"},
    )
    storage = _seeded_storage(existing_paths={slot_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path)

    result = sync_pool_assignments(state, git, storage, pool_state_gw)

    assert result.assignments[0].branch_name == "feat/new"
    assert result.assignments[0].assigned_at == EARLIER  # preserved
    assert pool_state_gw.load() == result


def test_sync_ignores_placeholder_branches() -> None:
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    state = PoolState(
        pool_size=4,
        assignments=(SlotAssignment("slot-01", "feat/x", NOW, slot_path),),
    )
    git = FakeGitGateway(
        repo_root=repo.root,
        current_branch_by_path={slot_path: "__slot-01-br-stub__"},
    )
    storage = _seeded_storage(existing_paths={slot_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path)

    result = sync_pool_assignments(state, git, storage, pool_state_gw)

    assert result.assignments[0].branch_name == "feat/x"


def test_sync_preserves_assignment_when_detached_head() -> None:
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    state = PoolState(
        pool_size=4,
        assignments=(SlotAssignment("slot-01", "feat/x", NOW, slot_path),),
    )
    git = FakeGitGateway(
        repo_root=repo.root,
        current_branch_by_path={slot_path: DetachedHead()},
    )
    storage = _seeded_storage(existing_paths={slot_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path)

    result = sync_pool_assignments(state, git, storage, pool_state_gw)

    assert result == state


def test_sync_raises_when_current_branch_lookup_fails() -> None:
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    state = PoolState(
        pool_size=4,
        assignments=(SlotAssignment("slot-01", "feat/x", NOW, slot_path),),
    )
    git = FakeGitGateway(
        repo_root=repo.root,
        current_branch_by_path={
            slot_path: GitCommandFailure(message="fatal: not a git repository", returncode=128)
        },
    )
    storage = _seeded_storage(existing_paths={slot_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path)

    with pytest.raises(SlotAllocationError, match="Failed to determine current branch"):
        sync_pool_assignments(state, git, storage, pool_state_gw)


# -- allocate_slot_for_branch ------------------------------------------------


def test_allocate_empty_pool_creates_slot_01() -> None:
    repo = _make_repo()
    git = FakeGitGateway(repo_root=repo.root, branches={"feat/x"})
    storage = _seeded_storage()
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path)

    ctx = build_test_slots_context(
        repo=repo,
        slots_root=ROOT / "slots",
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
    )
    result = allocate_slot_for_branch(ctx, branch_name="feat/x", now=NOW, force=False)

    assert isinstance(result, SlotAllocationResult)
    assert result.slot_name == "slot-01"
    assert result.worktree_path == repo.worktrees_dir / "slot-01"
    assert result.already_assigned is False
    assert result.evicted_slot is None
    assert git._add_worktree_calls == [(repo.root, repo.worktrees_dir / "slot-01", "feat/x", False)]
    saved = pool_state_gw.load()
    assert saved is not None
    assert saved.assignments[0].branch_name == "feat/x"


def test_allocate_picks_next_slot_when_partially_full() -> None:
    repo = _make_repo()
    existing_path = repo.worktrees_dir / "slot-01"
    seeded = PoolState(
        pool_size=16,
        assignments=(SlotAssignment("slot-01", "feat/a", NOW, existing_path),),
    )
    git = FakeGitGateway(
        repo_root=repo.root,
        branches={"feat/a", "feat/b"},
        worktrees=(WorktreeInfo(path=existing_path, branch="feat/a", is_bare=False),),
        current_branch_by_path={existing_path: "feat/a"},
    )
    storage = _seeded_storage(existing_paths={existing_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path, initial_state=seeded)

    ctx = build_test_slots_context(
        repo=repo,
        slots_root=ROOT / "slots",
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
    )
    result = allocate_slot_for_branch(ctx, branch_name="feat/b", now=NOW, force=False)

    assert isinstance(result, SlotAllocationResult)
    assert result.slot_name == "slot-02"
    assert result.worktree_path == repo.worktrees_dir / "slot-02"


def test_allocate_returns_already_assigned_when_branch_matches() -> None:
    repo = _make_repo()
    existing_path = repo.worktrees_dir / "slot-01"
    seeded = PoolState(
        pool_size=16,
        assignments=(SlotAssignment("slot-01", "feat/x", NOW, existing_path),),
    )
    git = FakeGitGateway(
        repo_root=repo.root,
        branches={"feat/x"},
        worktrees=(WorktreeInfo(path=existing_path, branch="feat/x", is_bare=False),),
        current_branch_by_path={existing_path: "feat/x"},
    )
    storage = _seeded_storage(existing_paths={existing_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path, initial_state=seeded)

    ctx = build_test_slots_context(
        repo=repo,
        slots_root=ROOT / "slots",
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
    )
    result = allocate_slot_for_branch(ctx, branch_name="feat/x", now=NOW, force=False)

    assert isinstance(result, SlotAllocationResult)
    assert result.already_assigned is True
    assert result.slot_name == "slot-01"
    # No new worktree was created.
    assert git._add_worktree_calls == []


def test_allocate_reallocates_when_recorded_worktree_missing() -> None:
    repo = _make_repo()
    ghost_path = repo.worktrees_dir / "slot-01"  # absent from storage
    seeded = PoolState(
        pool_size=16,
        assignments=(SlotAssignment("slot-01", "feat/x", NOW, ghost_path),),
    )
    git = FakeGitGateway(repo_root=repo.root, branches={"feat/x"})
    storage = _seeded_storage()  # ghost_path not seeded
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path, initial_state=seeded)

    ctx = build_test_slots_context(
        repo=repo,
        slots_root=ROOT / "slots",
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
    )
    result = allocate_slot_for_branch(ctx, branch_name="feat/x", now=NOW, force=False)

    assert isinstance(result, SlotAllocationResult)
    assert result.already_assigned is False
    assert result.slot_name == "slot-01"  # slot number reclaimed
    assert git._add_worktree_calls == [(repo.root, repo.worktrees_dir / "slot-01", "feat/x", False)]


def test_allocate_reuses_inactive_slot_via_checkout() -> None:
    repo = _make_repo()
    inactive_path = repo.worktrees_dir / "slot-01"
    git = FakeGitGateway(
        repo_root=repo.root,
        branches={"feat/x"},
        worktrees=(WorktreeInfo(path=inactive_path, branch="__slot-01-br-stub__", is_bare=False),),
    )
    storage = _seeded_storage(existing_paths={inactive_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path)

    ctx = build_test_slots_context(
        repo=repo,
        slots_root=ROOT / "slots",
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
    )
    result = allocate_slot_for_branch(ctx, branch_name="feat/x", now=NOW, force=False)

    assert isinstance(result, SlotAllocationResult)
    assert result.slot_name == "slot-01"
    assert result.worktree_path == inactive_path
    assert git._checkout_calls == [(inactive_path, "feat/x")]
    assert git._add_worktree_calls == []


def test_allocate_skips_dirty_inactive_slot_and_creates_new() -> None:
    repo = _make_repo()
    dirty_path = repo.worktrees_dir / "slot-01"
    git = FakeGitGateway(
        repo_root=repo.root,
        branches={"feat/x"},
        worktrees=(WorktreeInfo(path=dirty_path, branch="__slot-01-br-stub__", is_bare=False),),
        file_status_by_path={dirty_path: FileStatus(False, True, False)},
    )
    storage = _seeded_storage(existing_paths={dirty_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path)

    ctx = build_test_slots_context(
        repo=repo,
        slots_root=ROOT / "slots",
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
    )
    result = allocate_slot_for_branch(ctx, branch_name="feat/x", now=NOW, force=False)

    assert isinstance(result, SlotAllocationResult)
    # slot-01's directory already exists in storage, so disk-check bumps to slot-02.
    assert result.slot_name == "slot-02"
    assert git._add_worktree_calls == [(repo.root, repo.worktrees_dir / "slot-02", "feat/x", False)]


def test_allocate_pool_full_without_force_returns_error() -> None:
    repo = _make_repo()
    slot_01_path = repo.worktrees_dir / "slot-01"
    slot_02_path = repo.worktrees_dir / "slot-02"
    seeded = PoolState(
        pool_size=2,
        assignments=(
            SlotAssignment("slot-01", "feat/a", EARLIER, slot_01_path),
            SlotAssignment("slot-02", "feat/b", NOW, slot_02_path),
        ),
    )
    git = FakeGitGateway(
        repo_root=repo.root,
        branches={"feat/a", "feat/b", "feat/c"},
        worktrees=(
            WorktreeInfo(path=slot_01_path, branch="feat/a", is_bare=False),
            WorktreeInfo(path=slot_02_path, branch="feat/b", is_bare=False),
        ),
        current_branch_by_path={slot_01_path: "feat/a", slot_02_path: "feat/b"},
    )
    storage = _seeded_storage(existing_paths={slot_01_path, slot_02_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path, initial_state=seeded)

    ctx = build_test_slots_context(
        repo=repo,
        slots_root=ROOT / "slots",
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
    )
    result = allocate_slot_for_branch(ctx, branch_name="feat/c", now=NOW, force=False)

    assert isinstance(result, PoolFullError)
    assert result.oldest_slot == "slot-01"
    assert result.oldest_branch == "feat/a"


def test_allocate_pool_full_with_force_evicts_oldest() -> None:
    repo = _make_repo()
    slot_01_path = repo.worktrees_dir / "slot-01"
    slot_02_path = repo.worktrees_dir / "slot-02"
    seeded = PoolState(
        pool_size=2,
        assignments=(
            SlotAssignment("slot-01", "feat/a", EARLIER, slot_01_path),
            SlotAssignment("slot-02", "feat/b", NOW, slot_02_path),
        ),
    )
    git = FakeGitGateway(
        repo_root=repo.root,
        branches={"feat/a", "feat/b", "feat/c"},
        worktrees=(
            WorktreeInfo(path=slot_01_path, branch="feat/a", is_bare=False),
            WorktreeInfo(path=slot_02_path, branch="feat/b", is_bare=False),
        ),
        current_branch_by_path={slot_01_path: "feat/a", slot_02_path: "feat/b"},
    )
    storage = _seeded_storage(existing_paths={slot_01_path, slot_02_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path, initial_state=seeded)

    ctx = build_test_slots_context(
        repo=repo,
        slots_root=ROOT / "slots",
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
    )
    result = allocate_slot_for_branch(ctx, branch_name="feat/c", now=NOW, force=True)

    assert isinstance(result, SlotAllocationResult)
    assert result.slot_name == "slot-01"  # reused
    assert result.worktree_path == slot_01_path
    assert result.evicted_slot == "slot-01"
    # Existing worktree directory is preserved — we checkout, not add.
    assert git._checkout_calls == [(slot_01_path, "feat/c")]
    assert git._add_worktree_calls == []
    saved = pool_state_gw.load()
    assert saved is not None
    assert {a.branch_name for a in saved.assignments} == {"feat/b", "feat/c"}


def test_allocate_syncs_before_deciding() -> None:
    """pool.json says slot-01 is branch-x, but git shows branch-y. Sync should
    update the recorded state, and the subsequent allocation of branch-x should
    treat slot-01 as a normal empty slot to allocate into."""
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    seeded = PoolState(
        pool_size=4,
        assignments=(SlotAssignment("slot-01", "feat/x", EARLIER, slot_path),),
    )
    git = FakeGitGateway(
        repo_root=repo.root,
        branches={"feat/x", "feat/y"},
        worktrees=(WorktreeInfo(path=slot_path, branch="feat/y", is_bare=False),),
        current_branch_by_path={slot_path: "feat/y"},
    )
    storage = _seeded_storage(existing_paths={slot_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path, initial_state=seeded)

    ctx = build_test_slots_context(
        repo=repo,
        slots_root=ROOT / "slots",
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
    )
    result = allocate_slot_for_branch(ctx, branch_name="feat/x", now=NOW, force=False)

    assert isinstance(result, SlotAllocationResult)
    saved = pool_state_gw.load()
    assert saved is not None
    branches = {a.branch_name for a in saved.assignments}
    # After sync, slot-01 holds feat/y; new slot for feat/x is allocated.
    assert "feat/y" in branches
    assert "feat/x" in branches
