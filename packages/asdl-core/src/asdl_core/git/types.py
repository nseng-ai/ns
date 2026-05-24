"""Domain types for shared git gateway operations."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple


@dataclass(frozen=True)
class DetachedHead:
    """Sentinel returned when HEAD is not currently on a branch.

    Conforms to `asdl_core.clinkr.non_ideal_state.NonIdealState` so CLI
    callers can collapse the failure arm with `Ensure.ideal_state`.
    """

    @property
    def message(self) -> str:
        return "Detached HEAD: requires a checked-out branch."


@dataclass(frozen=True)
class GitCommandFailure:
    """Failure result from a git subprocess invocation.

    Conforms to `asdl_core.clinkr.non_ideal_state.NonIdealState`. The
    `error_type` field carries the CLI translation tag and defaults to
    `"git_failed"`; resolvers may override at construction time when a
    more specific tag is appropriate (e.g. `"git_current_branch_failed"`).
    """

    message: str
    returncode: int | None
    error_type: str = "git_failed"


@dataclass(frozen=True)
class LocalBranchTip:
    """A local branch name and its HEAD committer timestamp."""

    name: str
    head_iso: str | None


@dataclass(frozen=True)
class LocalBranchTipRef:
    """A local branch name and its HEAD object ID."""

    branch: str
    oid: str


@dataclass(frozen=True)
class CommitGraphNode:
    """One commit and its parent object IDs from a commit graph walk."""

    oid: str
    parent_oids: tuple[str, ...]


@dataclass(frozen=True)
class BranchCommitGraph:
    """Commit graph reachable from local branch tips and not reachable from base."""

    base_branch: str
    branch_tips: tuple[LocalBranchTipRef, ...]
    commits: tuple[CommitGraphNode, ...]


@dataclass(frozen=True)
class PathTouch:
    """Latest commit touching one path reachable from a ref."""

    oid: str
    committed_iso: str


@dataclass(frozen=True)
class PathChangeTouch:
    """One commit and changed paths under a pathspec."""

    oid: str
    committed_iso: str
    paths: tuple[str, ...]


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
