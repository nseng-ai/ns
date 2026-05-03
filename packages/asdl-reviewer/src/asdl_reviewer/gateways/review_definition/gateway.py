"""Gateway for loading markdown review definitions."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from asdl_reviewer.models import (
    ReviewDefinitionNotAFile,
    ReviewDefinitionNotFound,
    ReviewerFailure,
)

REVIEWS_DIRNAME = "reviews"


class ReviewDefinitionGateway(ABC):
    """Load and enumerate markdown-defined reviewers."""

    @abstractmethod
    def load_source(
        self,
        path: Path,
    ) -> str | ReviewDefinitionNotFound | ReviewDefinitionNotAFile:
        """Return the review-definition source text or a typed failure.

        Raises:
            ReviewDefinitionReadError: If the file exists but cannot be read.
        """

    @abstractmethod
    def list_reviews(self, reviews_dir: Path) -> tuple[str, ...] | ReviewerFailure:
        """Return the keys of all reviews found under ``reviews_dir``.

        Keys are relative paths from ``reviews_dir`` with the ``.md`` suffix
        stripped, using forward slashes (e.g. ``python/dignified``).
        """

    @abstractmethod
    def resolve_key(self, reviews_dir: Path, key: str) -> Path | ReviewerFailure:
        """Resolve a review key to its markdown file under ``reviews_dir``."""
