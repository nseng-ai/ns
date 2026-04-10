"""Abstract base class for GitHub issue operations."""

from __future__ import annotations

from abc import ABC, abstractmethod

from twerk_core.gh.types import GhIssue


class GhIssueGateway(ABC):
    """Gateway for GitHub issue operations.

    Sub-gateway of the GH facade. Mirrors `gh issue` subcommands.
    """

    @abstractmethod
    def list(self, *, label: str | None = None, state: str = "open") -> tuple[GhIssue, ...]:
        """List issues, optionally filtered by label and state.

        Args:
            label: If provided, only return issues with this label.
            state: One of "open", "closed", or "all". Defaults to "open".
        """
