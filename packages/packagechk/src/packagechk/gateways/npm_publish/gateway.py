from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class NpmPublishError(Exception):
    """npm placeholder publish operation failed."""


class NpmPublishGateway(ABC):
    """Publish placeholder packages to the npm registry."""

    @abstractmethod
    def ensure_publish_tools_available(self) -> str | None:
        """Return an error message if required tools are unavailable."""

    @abstractmethod
    def publish_project(self, project_dir: Path) -> str | None:
        """Publish the project at `project_dir`. Return an error message on failure."""
