from __future__ import annotations

from pathlib import Path

from twerk_slots.gateway.testing import FakeGitGateway, FakeSlotsStorageGateway
from twerk_slots.repo_context import (
    SLOTS_ROOT,
    NoRepoSentinel,
    RepoContext,
    discover_repo_or_sentinel,
    ensure_slots_metadata_dir,
)


def test_slots_root_is_under_home() -> None:
    assert SLOTS_ROOT == Path.home() / ".slots"


def test_discover_returns_sentinel_when_cwd_missing(tmp_path: Path) -> None:
    missing = tmp_path / "does" / "not" / "exist"
    git = FakeGitGateway(repo_root=tmp_path)

    result = discover_repo_or_sentinel(missing, slots_root=tmp_path / "slots", git=git)

    assert isinstance(result, NoRepoSentinel)
    assert "does not exist" in result.message


def test_discover_returns_sentinel_outside_repo(tmp_path: Path) -> None:
    outside = tmp_path / "not_a_repo"
    outside.mkdir()
    git = FakeGitGateway(
        repo_root=outside,
        git_common_dir=None,
        existing_paths={outside},
    )

    result = discover_repo_or_sentinel(outside, slots_root=tmp_path / "slots", git=git)

    assert isinstance(result, NoRepoSentinel)
    assert "Not inside a git repository" in result.message


def test_discover_main_repo(tmp_path: Path) -> None:
    repo = tmp_path / "myrepo"
    repo.mkdir()
    slots_root = tmp_path / "slots"

    git = FakeGitGateway(
        repo_root=repo,
        git_common_dir=repo / ".git",
        existing_paths={repo},
        repository_root_by_cwd={repo.resolve(): repo},
    )

    result = discover_repo_or_sentinel(repo, slots_root=slots_root, git=git)

    assert isinstance(result, RepoContext)
    assert result.repo_name == "myrepo"
    assert result.root == repo
    assert result.main_repo_root == repo.resolve()
    assert result.repo_dir == slots_root / "repos" / "myrepo"
    assert result.worktrees_dir == slots_root / "repos" / "myrepo" / "worktrees"
    assert result.pool_json_path == slots_root / "repos" / "myrepo" / "pool.json"


def test_discover_from_worktree_uses_main_repo_name_for_metadata(tmp_path: Path) -> None:
    main_repo = tmp_path / "myrepo"
    worktree = tmp_path / "slots_wt" / "slot-01"
    main_repo.mkdir()
    worktree.mkdir(parents=True)
    slots_root = tmp_path / "slots"

    # get_git_common_dir from inside a worktree points at the main repo's .git
    git = FakeGitGateway(
        repo_root=main_repo,
        git_common_dir=main_repo / ".git",
        existing_paths={worktree, main_repo},
        repository_root_by_cwd={worktree.resolve(): worktree},
    )

    result = discover_repo_or_sentinel(worktree, slots_root=slots_root, git=git)

    assert isinstance(result, RepoContext)
    assert result.repo_name == "myrepo"
    # Working tree root is the worktree path, but metadata is keyed off main_repo_root.
    assert result.root == worktree
    assert result.main_repo_root == main_repo.resolve()
    assert result.repo_dir == slots_root / "repos" / "myrepo"


def test_ensure_slots_metadata_dir_delegates_to_storage() -> None:
    repo_dir = Path("/slots/repos/myrepo")
    worktrees_dir = repo_dir / "worktrees"
    repo = RepoContext(
        root=Path("/myrepo"),
        main_repo_root=Path("/myrepo"),
        repo_name="myrepo",
        repo_dir=repo_dir,
        worktrees_dir=worktrees_dir,
        pool_json_path=repo_dir / "pool.json",
    )
    storage = FakeSlotsStorageGateway()

    result = ensure_slots_metadata_dir(repo, storage)

    assert result == repo_dir
    assert storage._ensured_dirs == [repo_dir, worktrees_dir]
    assert storage.path_exists(repo_dir)
    assert storage.path_exists(worktrees_dir)
