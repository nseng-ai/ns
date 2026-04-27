"""Narrow PR-by-branch gateway, separate from the mixed-surface IssueGateway.

Consumers that only need "look up the PR for this branch" (e.g. `slot gc`)
can depend on this ABC instead of pulling in the full IssueGateway surface.
The shared subprocess helper lives in
``twerk_core.gh.real_gateway_helpers`` so both real implementations execute
the same ``gh pr view`` call.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from twerk_core.gh.real_gateway_helpers import (
    fetch_pr_details_for_branch,
    fetch_pr_summary_for_branch,
    merge_pr,
    search_prs,
)
from twerk_core.gh.types import (
    PRCommandError,
    PRDetails,
    PRLookupError,
    PRMergeResult,
    PRStateFilter,
    PRSummary,
)


class PRGateway(ABC):
    """Narrow gateway for PR lookups by branch."""

    @abstractmethod
    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        """Look up the PR for a branch.

        Returns ``PRSummary`` on success or ``PRLookupError`` when the
        underlying ``gh pr view`` call fails (no PR, auth error, etc.).
        """

    @abstractmethod
    def get_pr_details_for_branch(self, branch: str) -> PRDetails | PRLookupError:
        """Look up detailed PR metadata for guarded merge workflows."""

    @abstractmethod
    def search_prs(
        self, query: str, *, state: PRStateFilter
    ) -> tuple[PRSummary, ...] | PRLookupError:
        """Search PRs in the given lifecycle ``state`` by free-text query.

        ``state`` is the value passed to ``gh pr list --state``: one of
        ``"open"``, ``"closed"``, ``"merged"``, or ``"all"`` (no filter).
        Returns the matched PRs (possibly empty) on success, or
        ``PRLookupError`` when the underlying ``gh pr list`` call fails.
        """

    @abstractmethod
    def merge_pr(
        self,
        pr_number: int,
        *,
        match_head_commit: str,
        admin: bool,
        auto: bool,
    ) -> PRMergeResult | PRCommandError:
        """Squash-merge or enable auto-merge for ``pr_number`` with a head guard."""


class RealPRGateway(PRGateway):
    """Real implementation backed by the `gh` CLI."""

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return fetch_pr_summary_for_branch(branch)

    def get_pr_details_for_branch(self, branch: str) -> PRDetails | PRLookupError:
        return fetch_pr_details_for_branch(branch)

    def search_prs(
        self, query: str, *, state: PRStateFilter
    ) -> tuple[PRSummary, ...] | PRLookupError:
        return search_prs(query, state=state)

    def merge_pr(
        self,
        pr_number: int,
        *,
        match_head_commit: str,
        admin: bool,
        auto: bool,
    ) -> PRMergeResult | PRCommandError:
        return merge_pr(
            pr_number,
            match_head_commit=match_head_commit,
            admin=admin,
            auto=auto,
        )
