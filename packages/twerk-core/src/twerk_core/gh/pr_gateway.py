"""Narrow PR-by-branch gateway, separate from the mixed-surface IssueGateway.

Consumers that only need "look up the PR for this branch" (e.g. `slot gc`)
can depend on this ABC instead of pulling in the full IssueGateway surface.
The shared subprocess helper lives in
``twerk_core.gh.real_gateway_helpers`` so both real implementations execute
the same ``gh pr view`` call.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from twerk_core.gh.real_gateway_helpers import fetch_pr_summary_for_branch
from twerk_core.gh.types import PRLookupError, PRSummary


class PRGateway(ABC):
    """Narrow gateway for PR lookups by branch."""

    @abstractmethod
    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        """Look up the PR for a branch.

        Returns ``PRSummary`` on success or ``PRLookupError`` when the
        underlying ``gh pr view`` call fails (no PR, auth error, etc.).
        """


class RealPRGateway(PRGateway):
    """Real implementation backed by the `gh` CLI."""

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return fetch_pr_summary_for_branch(branch)
