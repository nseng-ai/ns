"""Slot operation errors shared across the package."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


class SlotAllocationError(Exception):
    """Raised when allocation cannot proceed due to a broken repo invariant."""


@dataclass(frozen=True)
class DetachedHeadError:
    """Signals that the current worktree is on a detached HEAD."""

    cwd: Path


@dataclass(frozen=True)
class DirtyCurrentWorktreeError:
    """Signals that the current worktree has uncommitted changes."""

    cwd: Path
