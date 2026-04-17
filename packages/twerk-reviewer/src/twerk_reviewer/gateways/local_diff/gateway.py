"""Gateway for loading the local branch diff to review."""

from __future__ import annotations

from abc import ABC, abstractmethod

from twerk_reviewer.models import LocalDiff, ReviewerFailure


class LocalDiffGateway(ABC):
    """Load the local diff that the reviewer should inspect."""

    @abstractmethod
    def load_diff(self, *, base_ref: str | None) -> LocalDiff | ReviewerFailure:
        """Return the local diff against ``base_ref`` or a typed failure."""
