"""In-memory fake for the local-diff gateway."""

from __future__ import annotations

from twerk_reviewer.gateways.local_diff.gateway import LocalDiffGateway
from twerk_reviewer.models import LocalDiff, ReviewerFailure


class FakeLocalDiffGateway(LocalDiffGateway):
    """Return configured diffs without touching git."""

    def __init__(
        self,
        *,
        results_by_base_ref: dict[str | None, LocalDiff | ReviewerFailure] | None = None,
        default_result: LocalDiff | ReviewerFailure | None = None,
    ) -> None:
        self._results_by_base_ref = dict(results_by_base_ref or {})
        self._default_result = default_result or LocalDiff(base_ref="main", diff_text="")
        self._requested_base_refs: list[str | None] = []

    def load_diff(self, *, base_ref: str | None) -> LocalDiff | ReviewerFailure:
        self._requested_base_refs.append(base_ref)
        if base_ref in self._results_by_base_ref:
            return self._results_by_base_ref[base_ref]
        return self._default_result

    @property
    def requested_base_refs(self) -> tuple[str | None, ...]:
        """Return the base refs requested during the test."""
        return tuple(self._requested_base_refs)
