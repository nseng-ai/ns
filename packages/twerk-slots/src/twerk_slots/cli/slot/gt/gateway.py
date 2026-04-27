from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from twerk_slots.cli.slot.gt.types import (
    GtBranchInfo,
    GtCommandFailure,
    NoParent,
    UntrackedBranch,
)


class GtGateway(ABC):
    """Graphite operations used by ``slot gt`` commands."""

    @abstractmethod
    def parent_of(self, cwd: Path) -> str | NoParent | UntrackedBranch | GtCommandFailure:
        """Return the Graphite parent for the branch checked out at ``cwd``."""

    @abstractmethod
    def children_of(self, cwd: Path) -> tuple[str, ...] | UntrackedBranch | GtCommandFailure:
        """Return Graphite children for the branch checked out at ``cwd``."""

    @abstractmethod
    def trunk(self, cwd: Path) -> str | GtCommandFailure:
        """Return Graphite's configured trunk branch."""

    @abstractmethod
    def branch_info(self, cwd: Path) -> GtBranchInfo | UntrackedBranch | GtCommandFailure:
        """Return branch info for the branch checked out at ``cwd``."""

    @abstractmethod
    def restack_upstack(self, cwd: Path, branch: str) -> GtCommandFailure | None:
        """Restack ``branch`` and its upstack descendants."""

    @abstractmethod
    def sync(self, cwd: Path, *, restack: bool) -> GtCommandFailure | None:
        """Sync Graphite metadata."""
