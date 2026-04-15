"""Narrow PR-by-branch gateway, separate from the mixed-surface IssueGateway.

Consumers that only need "look up the PR for this branch" (e.g. `slot gc`)
can depend on this ABC instead of pulling in the full IssueGateway surface.
The `fetch_pr_summary_for_branch` helper is shared with `RealIssueGateway`
so both real implementations execute the same `gh pr view` call.
"""

from __future__ import annotations

import json
import subprocess
from abc import ABC, abstractmethod

from twerk_core.gh.types import PRLookupError, PRState, PRSummary


def fetch_pr_summary_for_branch(branch: str) -> PRSummary | PRLookupError:
    """Shell out to `gh pr view <branch>` and return a PRSummary.

    Shared helper used by both `RealPRGateway` and `RealIssueGateway` so the
    subprocess logic lives in one place.
    """
    result = subprocess.run(
        [
            "gh",
            "pr",
            "view",
            branch,
            "--json",
            "number,title,url,headRefName,baseRefName,state",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return PRLookupError(
            stderr=result.stderr.strip(),
            returncode=result.returncode,
        )
    data = json.loads(result.stdout)
    state: PRState = data["state"]
    return PRSummary(
        number=data["number"],
        title=data["title"],
        url=data["url"],
        head_ref_name=data["headRefName"],
        base_ref_name=data["baseRefName"],
        state=state,
    )


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
