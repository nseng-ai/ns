"""Gateway for the local git diff used as input to a review."""

from __future__ import annotations

from abc import ABC, abstractmethod

from roaster.models import BaseRefUnavailable, LocalDiff


class LocalDiffGateway(ABC):
    """Load the local git diff that a review will be run against."""

    @abstractmethod
    def load_diff(self, *, base_ref: str | None) -> LocalDiff | BaseRefUnavailable:
        """Return the local diff against ``base_ref`` or a typed failure."""
