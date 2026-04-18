"""Gateway for loading the local branch diff to review."""

from __future__ import annotations

from abc import ABC, abstractmethod

from twerk_reviewer.models import BaseRefUnavailable, LocalDiff


class LocalDiffGateway(ABC):
    """Load the local diff that the reviewer should inspect."""

    @abstractmethod
    def load_diff(self, *, base_ref: str | None) -> LocalDiff | BaseRefUnavailable:
        """Return the local diff against ``base_ref`` or a typed failure.

        Raises:
            RepoRootUnavailableError: If the current git repo root cannot be
                resolved.
            GitDiffFailedError: If ``git diff`` exits non-zero.
        """
