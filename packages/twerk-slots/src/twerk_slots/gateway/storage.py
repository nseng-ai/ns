"""Abstract gateway for slots metadata-directory filesystem operations.

Separates ``~/.slots/`` directory presence concerns from git state so tests
can exercise allocation logic without touching the real filesystem.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class SlotsStorageGateway(ABC):
    """Gateway for ``.exists()`` / ``mkdir(parents=True, exist_ok=True)`` calls."""

    @abstractmethod
    def path_exists(self, path: Path) -> bool:
        """Return True when ``path`` exists on the filesystem."""

    @abstractmethod
    def ensure_dir(self, path: Path) -> None:
        """Create ``path`` (with parents) if it does not already exist."""

    @abstractmethod
    def list_subdirs(self, path: Path) -> tuple[str, ...]:
        """Return names (not paths) of the immediate subdirectories of ``path``.

        Returns an empty tuple when ``path`` does not exist. Order is not
        guaranteed beyond what the implementation happens to provide; callers
        that need deterministic order should sort.
        """
