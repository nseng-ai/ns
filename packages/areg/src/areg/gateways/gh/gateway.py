"""Gateway for the GitHub CLI (`gh`)."""

from __future__ import annotations

from abc import ABC, abstractmethod


class GhNotFound(Exception):
    """Raised when `gh api` returns a 404 (repo or path missing)."""


class GhAuthError(Exception):
    """Raised when `gh api` returns a 401 or 403 (authentication failure)."""


class GhError(Exception):
    """Raised for any other `gh` failure."""


class GhCli(ABC):
    """Abstract gateway for the GitHub CLI."""

    @abstractmethod
    def list_directory(self, repo: str, path: str) -> list[str]:
        """Return the names of entries under ``repos/{repo}/contents/{path}``.

        Raises:
            GhNotFound: ``gh api`` returned a 404.
            GhAuthError: ``gh api`` returned a 401 or 403.
            GhError: any other failure.
        """
