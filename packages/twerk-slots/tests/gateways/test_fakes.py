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

    assert gateway.branch_exists(Path("/r"), "main")
    assert not gateway.branch_exists(Path("/r"), "nope")
    assert gateway.list_local_branches(Path("/r")) == ("feat/x", "main")


def test_fake_worktree_listing_and_current_branch() -> None:
    worktree = WorktreeInfo(path=Path("/wt/slot-01"), branch="feat/x")
    gateway = FakeGitGateway(
        repo_root=Path("/r"),
        worktrees=(worktree,),
        current_branch_by_path={Path("/wt/slot-01"): "feat/x"},
    )

    assert gateway.list_worktrees(Path("/r")) == (worktree,)
    assert gateway.get_current_branch(Path("/wt/slot-01")) == "feat/x"


def test_fake_add_worktree_records_mutation_and_exposes_new_worktree() -> None:
    repo_root = Path("/r")
    gateway = FakeGitGateway(repo_root=repo_root)
    target = Path("/wt/slot-01")

    info = gateway.add_worktree(repo_root, target, "feat/x", create_branch=False)

    assert info == WorktreeInfo(path=target, branch="feat/x", is_bare=False)
    assert gateway._add_worktree_calls == [(repo_root, target, "feat/x", False)]
    assert gateway.path_exists(target)
    worktrees = gateway.list_worktrees(repo_root)
    assert worktrees[0].path == target
    assert worktrees[0].branch == "feat/x"
    assert gateway.get_current_branch(target) == "feat/x"


def test_fake_checkout_updates_worktree_and_mutation_log() -> None:
    gateway = FakeGitGateway(
        repo_root=Path("/r"),
        worktrees=(WorktreeInfo(path=Path("/wt/slot-01"), branch="feat/x"),),
        current_branch_by_path={Path("/wt/slot-01"): "feat/x"},
    )

    gateway.checkout_branch(Path("/wt/slot-01"), "feat/y")

    assert gateway._checkout_calls == [(Path("/wt/slot-01"), "feat/y")]
    assert gateway.get_current_branch(Path("/wt/slot-01")) == "feat/y"
    assert gateway.list_worktrees(Path("/r"))[0].branch == "feat/y"


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
    gateway = FakePoolStateGateway()
    assert gateway.load(Path("/nowhere/pool.json")) is None


def test_fake_pool_state_load_returns_seeded_state() -> None:
    path = Path("/slots/repos/r/pool.json")
    state = PoolState(
        pool_size=4,
        assignments=(SlotAssignment("slot-01", "feat/x", "t", Path("/wt/slot-01")),),
    )
    gateway = FakePoolStateGateway(states={path: state})

    assert gateway.load(path) == state


def test_fake_pool_state_save_records_and_round_trips() -> None:
    gateway = FakePoolStateGateway()
    path = Path("/slots/repos/r/pool.json")
    state = PoolState(pool_size=8, assignments=())

    gateway.save(path, state)

    assert gateway._save_calls == [(path, state)]
    assert gateway.load(path) == state


def test_fake_pool_state_save_overwrites_prior_state() -> None:
    path = Path("/slots/repos/r/pool.json")
    first = PoolState(pool_size=4, assignments=())
    second = PoolState(
        pool_size=4,
        assignments=(SlotAssignment("slot-01", "feat/x", "t", Path("/wt/slot-01")),),
    )
    gateway = FakePoolStateGateway(states={path: first})

    gateway.save(path, second)

    assert gateway.load(path) == second
    assert gateway._save_calls == [(path, second)]
