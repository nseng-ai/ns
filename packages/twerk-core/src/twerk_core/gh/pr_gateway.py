"""Abstract base class for PR-only GitHub lookups."""

from __future__ import annotations

from abc import ABC, abstractmethod

from twerk_core.gh.types import PRLookupError, PRSummary


class PRGateway(ABC):
    """Gateway for PR-only lookup operations."""

    @abstractmethod
    def find_prs_for_branch(
        self,
        branch: str,
        *,
        state: str = "open",
    ) -> tuple[PRSummary, ...] | PRLookupError:
        """Return PRs whose head ref matches ``branch``.

        Returns an empty tuple when no PRs match and ``PRLookupError`` only
        when the underlying lookup itself fails.
        """
