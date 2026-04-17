"""Gateway for loading markdown review definitions."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from twerk_reviewer.models import ReviewerFailure


class ReviewDefinitionGateway(ABC):
    """Load the source text for a markdown-defined reviewer."""

    @abstractmethod
    def load_source(self, path: Path) -> str | ReviewerFailure:
        """Return the review-definition source text or a typed failure."""
