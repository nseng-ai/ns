"""Gateway for loading markdown review definitions."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from twerk_reviewer.models import ReviewDefinitionNotAFile, ReviewDefinitionNotFound


class ReviewDefinitionGateway(ABC):
    """Load the source text for a markdown-defined reviewer."""

    @abstractmethod
    def load_source(
        self,
        path: Path,
    ) -> str | ReviewDefinitionNotFound | ReviewDefinitionNotAFile:
        """Return the review-definition source text or a typed failure.

        Raises:
            ReviewDefinitionReadError: If the file exists but cannot be read.
        """
