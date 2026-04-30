"""Domain types for shared git gateway operations."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple


@dataclass(frozen=True)
class DetachedHead:
    """Sentinel returned when HEAD is not currently on a branch.

    Conforms to `twerk_core.clinkr.non_ideal_state.NonIdealState` so CLI
    callers can collapse the failure arm with `Ensure.ideal_state`.
    """

    @property
    def message(self) -> str:
        return "Detached HEAD: requires a checked-out branch."


@dataclass(frozen=True)
class GitCommandFailure:
    """Failure result from a git subprocess invocation.

    Conforms to `twerk_core.clinkr.non_ideal_state.NonIdealState`. The
    `error_type` field carries the CLI translation tag and defaults to
    `"git_failed"`; resolvers may override at construction time when a
    more specific tag is appropriate (e.g. `"git_current_branch_failed"`).
    """

    message: str
    returncode: int | None
    error_type: str = "git_failed"


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


@dataclass(frozen=True)
class CommitSummary:
    """One commit reported by ``git log`` over a range."""

    sha: str
    author_iso: str
    subject: str
