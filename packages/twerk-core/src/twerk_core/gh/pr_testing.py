"""Test utilities for the narrow PRGateway."""

from __future__ import annotations

from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.types import PRLookupError, PRStateFilter, PRSummary


class FakePRGateway(PRGateway):
    """In-memory fake for PRGateway; seeds via constructor only."""

    def __init__(
        self,
        *,
        prs_by_branch: dict[str, PRSummary] | None = None,
        prs: tuple[PRSummary, ...] = (),
        search_failure: PRLookupError | None = None,
    ) -> None:
        self._prs_by_branch = prs_by_branch or {}
        self._prs = prs
        self._search_failure = search_failure

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        pr = self._prs_by_branch.get(branch)
        if pr is None:
            return PRLookupError(stderr="no PR found", returncode=1)
        return pr

    def search_prs(
        self, query: str, *, state: PRStateFilter
    ) -> tuple[PRSummary, ...] | PRLookupError:
        if self._search_failure is not None:
            return self._search_failure
        # Filter by lifecycle state first; "all" disables the state filter.
        if state == "all":
            scoped = self._prs
        else:
            scoped = tuple(pr for pr in self._prs if pr.state == state.upper())
        # Match by case-insensitive substring of any whitespace-split token.
        terms = [t.lower() for t in query.split() if t]
        if not terms:
            return scoped
        return tuple(pr for pr in scoped if any(t in pr.title.lower() for t in terms))
