from __future__ import annotations

from pathlib import Path

from twerk_slots.gateway.git import FileStatus, WorktreeInfo
from twerk_slots.gateway.testing import (
    FakeGitGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)
from twerk_slots.pool_state import PoolState, SlotAssignment


def test_fake_returns_seeded_repo_root() -> None:
    repo_root = Path("/repos/myrepo")
    gateway = FakeGitGateway(repo_root=repo_root)

    assert gateway.get_repository_root(repo_root) == repo_root
    assert gateway.get_git_common_dir(repo_root) == repo_root / ".git"


def test_fake_branch_queries() -> None:
    gateway = FakeGitGateway(
        repo_root=Path("/r"),
        branches={"main", "feat/x"},
    )

    assert gateway.branch_exists("main")
    assert not gateway.branch_exists("nope")
    assert gateway.list_local_branches() == ("feat/x", "main")


def test_fake_worktree_listing_and_current_branch() -> None:
    worktree = WorktreeInfo(path=Path("/wt/slot-01"), branch="feat/x", is_bare=False)
    gateway = FakeGitGateway(
        repo_root=Path("/r"),
        worktrees=(worktree,),
        current_branch_by_path={Path("/wt/slot-01"): "feat/x"},
    )

    assert gateway.list_worktrees() == (worktree,)
    assert gateway.get_current_branch(Path("/wt/slot-01")) == "feat/x"


def test_fake_add_worktree_records_mutation_and_exposes_new_worktree() -> None:
    repo_root = Path("/r")
    gateway = FakeGitGateway(repo_root=repo_root)
    target = Path("/wt/slot-01")

    info = gateway.add_worktree(target, "feat/x", create_branch=False)

    assert info == WorktreeInfo(path=target, branch="feat/x", is_bare=False)
    assert gateway._add_worktree_calls == [(repo_root, target, "feat/x", False)]
    assert gateway.path_exists(target)
    worktrees = gateway.list_worktrees()
    assert worktrees[0].path == target
    assert worktrees[0].branch == "feat/x"
    assert gateway.get_current_branch(target) == "feat/x"


def test_fake_git_create_branch_records_call() -> None:
    gateway = FakeGitGateway(repo_root=Path("/r"), branches={"main"})

    gateway.create_branch("feat/x", "main", force=False)

    assert gateway._create_branch_calls == [("feat/x", "main", False)]
    assert "feat/x" in gateway.list_local_branches()


def test_fake_git_create_branch_conflict_without_force_asserts() -> None:
    gateway = FakeGitGateway(repo_root=Path("/r"), branches={"feat/x"})

    try:
        gateway.create_branch("feat/x", "main", force=False)
    except AssertionError as exc:
        assert "already exists" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("expected AssertionError")

    # No mutation recorded on refusal.
    assert gateway._create_branch_calls == []


def test_fake_git_create_branch_force_overwrites() -> None:
    gateway = FakeGitGateway(repo_root=Path("/r"), branches={"feat/x"})

    gateway.create_branch("feat/x", "main", force=True)

    assert gateway._create_branch_calls == [("feat/x", "main", True)]
    assert "feat/x" in gateway.list_local_branches()


def test_fake_checkout_updates_worktree_and_mutation_log() -> None:
    gateway = FakeGitGateway(
        repo_root=Path("/r"),
        worktrees=(WorktreeInfo(path=Path("/wt/slot-01"), branch="feat/x", is_bare=False),),
        current_branch_by_path={Path("/wt/slot-01"): "feat/x"},
    )

    gateway.checkout_branch(Path("/wt/slot-01"), "feat/y")

    assert gateway._checkout_calls == [(Path("/wt/slot-01"), "feat/y")]
    assert gateway.get_current_branch(Path("/wt/slot-01")) == "feat/y"
    assert gateway.list_worktrees()[0].branch == "feat/y"


def test_fake_file_status_defaults_clean() -> None:
    gateway = FakeGitGateway(repo_root=Path("/r"))
    assert gateway.get_file_status(Path("/anywhere")) == FileStatus(False, False, False)
    assert not gateway.has_uncommitted_changes(Path("/anywhere"))


def test_fake_file_status_respects_seeding() -> None:
    gateway = FakeGitGateway(
        repo_root=Path("/r"),
        file_status_by_path={Path("/wt/slot-01"): FileStatus(True, False, False)},
    )
    assert gateway.get_file_status(Path("/wt/slot-01")) == FileStatus(True, False, False)
    assert gateway.has_uncommitted_changes(Path("/wt/slot-01"))


# -- FakeSlotsStorageGateway ------------------------------------------------


def test_fake_storage_path_exists_from_seeded_paths() -> None:
    seeded = Path("/slots/repos/r")
    storage = FakeSlotsStorageGateway(existing_paths={seeded})

    assert storage.path_exists(seeded)
    assert not storage.path_exists(Path("/slots/repos/other"))


def test_fake_storage_ensure_dir_records_and_marks_existing() -> None:
    storage = FakeSlotsStorageGateway()
    target = Path("/slots/repos/r")

    assert not storage.path_exists(target)
    storage.ensure_dir(target)

    assert storage._ensured_dirs == [target]
    assert storage.path_exists(target)


def test_fake_storage_ensure_dir_idempotent() -> None:
    storage = FakeSlotsStorageGateway()
    target = Path("/slots/repos/r")

    storage.ensure_dir(target)
    storage.ensure_dir(target)

    assert storage._ensured_dirs == [target, target]
    assert storage.path_exists(target)


# -- FakePoolStateGateway ---------------------------------------------------


def test_fake_pool_state_load_returns_none_when_absent() -> None:
    gateway = FakePoolStateGateway(Path("/nowhere/pool.json"))
    assert gateway.load() is None


def test_fake_pool_state_load_returns_seeded_state() -> None:
    path = Path("/slots/repos/r/pool.json")
    state = PoolState(
        pool_size=4,
        assignments=(SlotAssignment("slot-01", "feat/x", "t", Path("/wt/slot-01")),),
    )
    gateway = FakePoolStateGateway(path, initial_state=state)

    assert gateway.load() == state


def test_fake_pool_state_save_records_and_round_trips() -> None:
    path = Path("/slots/repos/r/pool.json")
    gateway = FakePoolStateGateway(path)
    state = PoolState(pool_size=8, assignments=())

    gateway.save(state)

    assert gateway._save_calls == [state]
    assert gateway.load() == state


def test_fake_pool_state_save_overwrites_prior_state() -> None:
    path = Path("/slots/repos/r/pool.json")
    first = PoolState(pool_size=4, assignments=())
    second = PoolState(
        pool_size=4,
        assignments=(SlotAssignment("slot-01", "feat/x", "t", Path("/wt/slot-01")),),
    )
    gateway = FakePoolStateGateway(path, initial_state=first)

    gateway.save(second)

    assert gateway.load() == second
    assert gateway._save_calls == [second]
