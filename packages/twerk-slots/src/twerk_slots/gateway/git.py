"""Abstract git gateway for worktree pool operations.

The gateway stays local to twerk-slots — per objective #39, slots is the only
initial consumer of these methods, so we avoid extracting them to twerk-core
until a second consumer exists.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple


@dataclass(frozen=True)
class WorktreeInfo:
    """A worktree reported by ``git worktree list --porcelain``."""

    path: Path
    branch: str | None
    is_bare: bool = False


class FileStatus(NamedTuple):
    """Summary of a worktree's dirty state from ``git status --porcelain``."""

    staged: bool
    modified: bool
    untracked: bool


class GitGateway(ABC):
    """Gateway for git operations used by the slots package."""

    # -- Filesystem helpers --

    @abstractmethod
    def path_exists(self, path: Path) -> bool:
        """Return True when ``path`` exists on the filesystem."""

    # -- Repo discovery --

    @abstractmethod
    def get_repository_root(self, cwd: Path) -> Path:
        """Return the working tree root for ``cwd`` (``git rev-parse --show-toplevel``)."""

    @abstractmethod
    def get_git_common_dir(self, cwd: Path) -> Path | None:
        """Return the main repo's ``.git`` directory, or None when not in a repo."""

    # -- Branch queries --

    @abstractmethod
    def get_current_branch(self, cwd: Path) -> str | None:
        """Return the currently checked-out branch name, or None when detached."""

    @abstractmethod
    def branch_exists(self, repo_root: Path, branch: str) -> bool:
        """Return True when ``branch`` exists as a local branch in ``repo_root``."""

    @abstractmethod
    def list_local_branches(self, repo_root: Path) -> tuple[str, ...]:
        """Return the list of local branch names in ``repo_root``."""

    # -- Worktree operations --

    @abstractmethod
    def list_worktrees(self, repo_root: Path) -> tuple[WorktreeInfo, ...]:
        """List worktrees registered with ``repo_root``."""

    @abstractmethod
    def add_worktree(
        self,
        repo_root: Path,
        path: Path,
        branch: str,
        *,
        create_branch: bool,
    ) -> WorktreeInfo:
        """Add a worktree for ``branch`` at ``path`` and return its info."""

    @abstractmethod
    def checkout_branch(self, cwd: Path, branch: str) -> None:
        """Check out ``branch`` in the worktree rooted at ``cwd``."""

    # -- Status --

    @abstractmethod
    def has_uncommitted_changes(self, cwd: Path) -> bool:
        """Return True when the worktree has staged, modified, or untracked files."""

    @abstractmethod
    def get_file_status(self, cwd: Path) -> FileStatus:
        """Return a :class:`FileStatus` describing the worktree's dirty state."""
