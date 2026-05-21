"""Gateway for the review catalog: discover and load markdown review sources."""

from __future__ import annotations

from abc import ABC, abstractmethod

from asdl_reviewer.models import ReviewCatalog, ReviewerFailure, ReviewSource


class ReviewCatalogGateway(ABC):
    """Load review definitions and list available review keys."""

    @abstractmethod
    def load_review_source(self, *, key: str) -> ReviewSource | ReviewerFailure:
        """Return the markdown source for ``key`` or a typed failure."""

    @abstractmethod
    def list_review_keys(self) -> ReviewCatalog | ReviewerFailure:
        """Return all markdown review keys available in the environment."""
