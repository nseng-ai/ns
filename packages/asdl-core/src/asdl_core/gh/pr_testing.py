"""Test utilities for the narrow PRGateway."""

from __future__ import annotations

from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import (
    PRCommandError,
    PRDetails,
    PRLookupError,
    PRMergeResult,
    PRStateFilter,
    PRSummary,
)


class FakePRGateway(PRGateway):
    """In-memory fake for PRGateway; seeds via constructor only."""

    def __init__(
        self,
        *,
        prs_by_branch: dict[str, PRSummary] | None = None,
        pr_details_by_branch: dict[str, PRDetails] | None = None,
        prs: tuple[PRSummary, ...] = (),
        search_failure: PRLookupError | None = None,
        merge_failure: PRCommandError | None = None,
    ) -> None:
        self._prs_by_branch = prs_by_branch or {}
        self._pr_details_by_branch = pr_details_by_branch or {}
        self._prs = prs
        self._search_failure = search_failure
        self._merge_failure = merge_failure
        self._merge_calls: list[tuple[int, str, bool, bool]] = []

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        pr = self._prs_by_branch.get(branch)
        if pr is None:
            return PRLookupError(stderr="no PR found", returncode=1)
        return pr

    def get_pr_details_for_branch(self, branch: str) -> PRDetails | PRLookupError:
        """Return seeded ``PRDetails`` or synthesize from a ``PRSummary``.

        When only a ``PRSummary`` is seeded, the synthesized ``PRDetails`` uses
        ``head_ref_oid="HEAD"`` as a placeholder. Tests exercising the
        local-HEAD-vs-PR-head guardrail must seed ``pr_details_by_branch``
        explicitly so the OID matches what ``FakeGitGateway.branch_head_oid``
        returns; otherwise the synthesized ``"HEAD"`` will not match.
        """
        pr = self._pr_details_by_branch.get(branch)
        if pr is not None:
            return pr
        summary = self._prs_by_branch.get(branch)
        if summary is None:
            return PRLookupError(stderr="no PR found", returncode=1)
        return PRDetails(
            number=summary.number,
            head_ref_name=summary.head_ref_name,
            base_ref_name=summary.base_ref_name,
            head_ref_oid="HEAD",
        )

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

    def merge_pr(
        self,
        pr_number: int,
        *,
        match_head_commit: str,
        admin: bool,
        auto: bool,
    ) -> PRMergeResult | PRCommandError:
        self._merge_calls.append((pr_number, match_head_commit, admin, auto))
        if self._merge_failure is not None:
            return self._merge_failure
        return PRMergeResult(number=pr_number, auto=auto)

    @property
    def merge_calls(self) -> tuple[tuple[int, str, bool, bool], ...]:
        return tuple(self._merge_calls)
