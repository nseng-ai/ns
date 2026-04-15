"""Test utilities for the narrow PRGateway."""

from __future__ import annotations

from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.types import PRLookupError, PRSummary


class FakePRGateway(PRGateway):
    """In-memory fake for PRGateway; seeds via constructor only."""

    def __init__(self, *, prs_by_branch: dict[str, PRSummary] | None = None) -> None:
        self._prs_by_branch = prs_by_branch or {}

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        pr = self._prs_by_branch.get(branch)
        if pr is None:
            return PRLookupError(stderr="no PR found", returncode=1)
        return pr
