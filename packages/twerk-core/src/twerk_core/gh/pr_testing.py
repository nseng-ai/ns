"""Test utilities for the dedicated PR gateway."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.types import PRLookupError, PRSummary


class FakePRGateway(PRGateway):
    """In-memory fake implementation of PRGateway."""

    def __init__(
        self,
        *,
        prs_by_branch_state: Mapping[tuple[str, str], Sequence[PRSummary]] | None = None,
        errors_by_branch_state: Mapping[tuple[str, str], PRLookupError] | None = None,
    ) -> None:
        self._prs_by_branch_state = {
            key: tuple(value) for key, value in (prs_by_branch_state or {}).items()
        }
        self._errors_by_branch_state = dict(errors_by_branch_state or {})

    def find_prs_for_branch(
        self,
        branch: str,
        *,
        state: str = "open",
    ) -> tuple[PRSummary, ...] | PRLookupError:
        key = (branch, state)
        error = self._errors_by_branch_state.get(key)
        if error is not None:
            return error
        return self._prs_by_branch_state.get(key, ())
