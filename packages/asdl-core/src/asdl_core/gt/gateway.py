from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from asdl_core.gt.types import (
    GtBranchGraph,
    GtBranchInfo,
    GtCommandFailure,
    NoParent,
    StackInfo,
    UntrackedBranch,
)


class GtGateway(ABC):
    """Graphite operations shared across asdl packages."""

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

    @abstractmethod
    def stack(self, cwd: Path) -> StackInfo | UntrackedBranch | GtCommandFailure:
        """Return a metadata-store stack snapshot for the branch checked out at ``cwd``."""

    @abstractmethod
    def branch_graph(self, cwd: Path) -> GtBranchGraph | GtCommandFailure:
        """Return all Graphite-tracked branches under the configured Graphite trunk."""
