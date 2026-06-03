"""Gateway for the review catalog: discover and load markdown review sources."""

from __future__ import annotations

from abc import ABC, abstractmethod

from roaster.models import ReviewKeyCatalog, ReviewSource, RoasterFailure


class ReviewCatalogGateway(ABC):
    """Load review definitions and list available review keys."""

    @abstractmethod
    def load_review_source(self, *, key: str) -> ReviewSource | RoasterFailure:
        """Return the markdown source for ``key`` or a typed failure."""

    @abstractmethod
    def list_review_keys(self) -> ReviewKeyCatalog | RoasterFailure:
        """Return all markdown review keys available in the environment."""
