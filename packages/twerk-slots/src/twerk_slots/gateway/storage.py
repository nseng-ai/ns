"""Abstract gateway for slots metadata-directory filesystem operations.

Separates ``~/.slots/`` directory presence concerns from git state so tests
can exercise allocation logic without touching the real filesystem.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class SlotsStorageGateway(ABC):
    @abstractmethod
    def path_exists(self, path: Path) -> bool: ...

    @abstractmethod
    def ensure_dir(self, path: Path) -> None: ...
