"""Abstract interface for branch-scoped working memory."""

from __future__ import annotations

from abc import ABC, abstractmethod


class WorkingMemoryGateway(ABC):
    """Store small branch-scoped files outside the working tree.

    This v1 interface is single-writer only. Concurrent writes to the same
    branch are undefined behavior.
    """

    @abstractmethod
    def write(self, branch: str, files: dict[str, str]) -> None:
        """Add or replace files for ``branch`` without touching the worktree."""

    @abstractmethod
    def read(self, branch: str, path: str) -> str | None:
        """Read ``path`` from ``branch`` or return ``None`` when absent."""

    @abstractmethod
    def exists(self, branch: str) -> bool:
        """Return whether working memory exists for ``branch``."""
