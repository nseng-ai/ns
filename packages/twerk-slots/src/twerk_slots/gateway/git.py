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
    is_bare: bool


class FileStatus(NamedTuple):
    """Summary of a worktree's dirty state from ``git status --porcelain``."""

    staged: bool
    modified: bool
    untracked: bool


class GitGateway(ABC):
    """Gateway for git operations used by the slots package.

    Concrete implementations bind to a specific repository root at construction
    time, so methods operating on the main repo no longer require a
    ``repo_root`` argument.
    """

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
    def get_previous_branch(self, cwd: Path) -> str | None:
        """Return the previous branch (``git rev-parse --abbrev-ref '@{-1}'``) or None."""

    @abstractmethod
    def get_trunk_branch(self) -> str:
        """Return the repo's trunk branch name (main/master/etc.).

        Implementations guarantee that trunk is resolved and valid by the time
        the gateway is constructed — callers never see an unresolvable trunk.
        """

    @abstractmethod
    def branch_exists(self, branch: str) -> bool:
        """Return True when ``branch`` exists as a local branch in the bound repo."""

    @abstractmethod
    def list_local_branches(self) -> tuple[str, ...]:
        """Return the list of local branch names in the bound repo."""

    # -- Worktree operations --

    @abstractmethod
    def list_worktrees(self) -> tuple[WorktreeInfo, ...]:
        """List worktrees registered with the bound repo."""

    @abstractmethod
    def add_worktree(
        self,
        path: Path,
        branch: str,
        *,
        create_branch: bool,
    ) -> WorktreeInfo:
        """Add a worktree for ``branch`` at ``path`` and return its info."""

    @abstractmethod
    def checkout_branch(self, cwd: Path, branch: str) -> None:
        """Check out ``branch`` in the worktree rooted at ``cwd``."""

    @abstractmethod
    def detach_head(self, cwd: Path, ref: str) -> None:
        """Detach HEAD at ``ref`` in the worktree rooted at ``cwd`` (``git checkout --detach``)."""

    @abstractmethod
    def create_branch(self, branch: str, start_point: str, *, force: bool) -> None:
        """Create ``branch`` at ``start_point`` in the bound repo.

        ``force=True`` moves the ref if it already exists
        (``git branch -f``). Callers should pre-check existence via
        :meth:`list_local_branches` so the distinction stays explicit.
        """

    # -- Status --

    @abstractmethod
    def has_uncommitted_changes(self, cwd: Path) -> bool:
        """Return True when the worktree has staged, modified, or untracked files."""

    @abstractmethod
    def get_file_status(self, cwd: Path) -> FileStatus:
        """Return a :class:`FileStatus` describing the worktree's dirty state."""
