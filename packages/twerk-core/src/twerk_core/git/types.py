"""Domain types for shared git gateway operations."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple


@dataclass(frozen=True)
class DetachedHead:
    """Sentinel returned when HEAD is not currently on a branch."""


@dataclass(frozen=True)
class GitCommandFailure:
    """Failure result from a git subprocess invocation."""

    message: str
    returncode: int | None


@dataclass(frozen=True)
class RestructuredFile:
    """A file pair surfaced by git's rename/copy detection."""

    status: str
    old_path: str
    new_path: str
    similarity: int


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
