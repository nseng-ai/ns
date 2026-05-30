"""In-memory fake for the local-diff gateway."""

from __future__ import annotations

from asdl_reviewer.gateways.local_diff.gateway import LocalDiffGateway
from asdl_reviewer.models import BaseRefUnavailable, LocalDiff


class FakeLocalDiffGateway(LocalDiffGateway):
    """Return configured local-diff state without invoking git."""

    def __init__(
        self,
        *,
        diffs_by_base_ref: dict[str | None, LocalDiff | BaseRefUnavailable] | None = None,
        default_diff: LocalDiff | BaseRefUnavailable | None = None,
    ) -> None:
        self._diffs_by_base_ref = dict(diffs_by_base_ref or {})
        self._default_diff = default_diff or LocalDiff(base_ref="main", diff_text="")
        self._requested_base_refs: list[str | None] = []

    def load_diff(self, *, base_ref: str | None) -> LocalDiff | BaseRefUnavailable:
        self._requested_base_refs.append(base_ref)
        if base_ref in self._diffs_by_base_ref:
            return self._diffs_by_base_ref[base_ref]
        return self._default_diff

    @property
    def requested_base_refs(self) -> tuple[str | None, ...]:
        """Return the base refs requested during the test."""
        return tuple(self._requested_base_refs)
