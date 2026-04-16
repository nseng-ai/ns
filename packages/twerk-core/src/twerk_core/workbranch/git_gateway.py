"""Abstract git operations for the workbranch CLI."""

from __future__ import annotations

from abc import ABC, abstractmethod


class WorkbranchGitGateway(ABC):
    """Git operations needed by ``workbranch``."""

    @abstractmethod
    def create_branch_at_head(self, name: str) -> None:
        """Create ``name`` at ``HEAD``."""

    @abstractmethod
    def get_current_branch(self) -> str | None:
        """Return the current branch or ``None`` when detached."""

    @abstractmethod
    def branch_exists(self, name: str) -> bool:
        """Return whether ``name`` exists as a local branch."""
