"""In-memory FakeGitGateway used by slots tests.

Constructor-only configuration with mutation tracking for assertions, mirroring
the :class:`FakeIssueGateway` shape from twerk_core.
"""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Final

from twerk_slots.gateway.git import FileStatus, GitGateway, WorktreeInfo
from twerk_slots.gateway.storage import SlotsStorageGateway


class _Unset:
    """Sentinel type distinguishing an unprovided kwarg from an explicit None."""


_UNSET: Final = _Unset()


class FakeGitGateway(GitGateway):
    """Fake GitGateway that returns pre-seeded responses and records mutations."""

    def __init__(
        self,
        *,
        repo_root: Path,
        git_common_dir: Path | None | _Unset = _UNSET,
        branches: Iterable[str] = (),
        worktrees: tuple[WorktreeInfo, ...] = (),
        current_branch_by_path: dict[Path, str | None] | None = None,
        file_status_by_path: dict[Path, FileStatus] | None = None,
        existing_paths: Iterable[Path] = (),
        repository_root_by_cwd: dict[Path, Path] | None = None,
        storage: SlotsStorageGateway | None = None,
    ) -> None:
        self._repo_root = repo_root
        if isinstance(git_common_dir, _Unset):
            self._git_common_dir: Path | None = repo_root / ".git"
        else:
            self._git_common_dir = git_common_dir
        self._branches: set[str] = set(branches)
        self._worktrees: list[WorktreeInfo] = list(worktrees)
        self._current_branch_by_path: dict[Path, str | None] = dict(current_branch_by_path or {})
        self._file_status_by_path: dict[Path, FileStatus] = dict(file_status_by_path or {})
        self._existing_paths: set[Path] = set(existing_paths)
        self._repository_root_by_cwd: dict[Path, Path] = dict(repository_root_by_cwd or {})
        # Mirrors the real gateway's filesystem side effect: when provided,
        # ``add_worktree`` reports the new path to the storage gateway so
        # downstream ``storage.path_exists()`` checks succeed just like they
        # do against a real ``git worktree add``.
        self._storage: SlotsStorageGateway | None = storage

        # Mutation log — read by tests for assertions.
        self._add_worktree_calls: list[tuple[Path, Path, str, bool]] = []
        self._checkout_calls: list[tuple[Path, str]] = []
        self._create_branch_calls: list[tuple[str, str, bool]] = []

    # -- Filesystem helpers --

    def path_exists(self, path: Path) -> bool:
        if path in self._existing_paths:
            return True
        for wt in self._worktrees:
            if wt.path == path:
                return True
        return False

    # -- Repo discovery --

    def get_repository_root(self, cwd: Path) -> Path:
        if cwd in self._repository_root_by_cwd:
            return self._repository_root_by_cwd[cwd]
        return self._repo_root

    def get_git_common_dir(self, cwd: Path) -> Path | None:
        return self._git_common_dir

    # -- Branch queries --

    def get_current_branch(self, cwd: Path) -> str | None:
        return self._current_branch_by_path.get(cwd)

    def branch_exists(self, branch: str) -> bool:
        return branch in self._branches

    def list_local_branches(self) -> tuple[str, ...]:
        return tuple(sorted(self._branches))

    # -- Worktree operations --

    def list_worktrees(self) -> tuple[WorktreeInfo, ...]:
        return tuple(self._worktrees)

    def add_worktree(
        self,
        path: Path,
        branch: str,
        *,
        create_branch: bool,
    ) -> WorktreeInfo:
        self._add_worktree_calls.append((self._repo_root, path, branch, create_branch))
        info = WorktreeInfo(path=path, branch=branch, is_bare=False)
        self._worktrees.append(info)
        self._existing_paths.add(path)
        self._current_branch_by_path[path] = branch
        if self._storage is not None:
            self._storage.ensure_dir(path)
        return info

    def checkout_branch(self, cwd: Path, branch: str) -> None:
        self._checkout_calls.append((cwd, branch))
        self._current_branch_by_path[cwd] = branch
        self._worktrees = [
            WorktreeInfo(path=wt.path, branch=branch, is_bare=wt.is_bare) if wt.path == cwd else wt
            for wt in self._worktrees
        ]

    def create_branch(self, branch: str, start_point: str, *, force: bool) -> None:
        if branch in self._branches and not force:
            raise AssertionError(f"branch {branch!r} already exists; pass force=True to move it")
        self._create_branch_calls.append((branch, start_point, force))
        self._branches.add(branch)

    # -- Status --

    def has_uncommitted_changes(self, cwd: Path) -> bool:
        status = self.get_file_status(cwd)
        return status.staged or status.modified or status.untracked

    def get_file_status(self, cwd: Path) -> FileStatus:
        return self._file_status_by_path.get(
            cwd, FileStatus(staged=False, modified=False, untracked=False)
        )
