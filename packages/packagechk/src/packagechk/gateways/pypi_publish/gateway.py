from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class PypiPublishError(Exception):
    """PyPI placeholder build or publish operation failed."""


class PypiPublishGateway(ABC):
    """Build and publish placeholder distributions to PyPI."""

    @abstractmethod
    def ensure_publish_tools_available(self) -> str | None:
        """Return an error message if required tools are unavailable."""

    @abstractmethod
    def build_package(self, project_dir: Path) -> list[Path]:
        """Build distribution artifacts for the project."""

    @abstractmethod
    def publish_artifacts(self, project_dir: Path, artifacts: list[Path]) -> str | None:
        """Publish artifacts. Return an error message on failure."""
