"""Gateway for reading and writing persisted reviewer config."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

from twerk_reviewer.models import ReviewerFailure

CONFIG_SCHEMA_VERSION = 1
CONFIG_DIRNAME = ".twerk"
CONFIG_FILENAME = "reviewer.toml"


@dataclass(frozen=True)
class ReviewerConfig:
    """Persisted reviewer settings for one repository."""

    harness_name: str


def config_path(repo_root: Path) -> Path:
    """Return the canonical config path beneath ``repo_root``."""
    return repo_root / CONFIG_DIRNAME / CONFIG_FILENAME


class HarnessConfigGateway(ABC):
    """Read and write the reviewer's persisted configuration."""

    @abstractmethod
    def load(self, repo_root: Path) -> ReviewerConfig | ReviewerFailure:
        """Return the persisted config or a typed failure."""

    @abstractmethod
    def save(self, repo_root: Path, config: ReviewerConfig) -> None | ReviewerFailure:
        """Persist ``config`` to the repo-local config path."""
