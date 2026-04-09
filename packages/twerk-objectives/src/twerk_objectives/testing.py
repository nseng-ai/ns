"""Test fakes for objective operations."""

from __future__ import annotations

from collections.abc import Sequence

from twerk_objectives.gateway import ObjectiveIssueSummary, ObjectivesGitHub


class FakeObjectivesGitHub(ObjectivesGitHub):
    def __init__(self, *, objectives: Sequence[ObjectiveIssueSummary] = ()) -> None:
        self._objectives = tuple(objectives)

    def list_objectives(self, *, state: str = "open") -> tuple[ObjectiveIssueSummary, ...]:
        if state == "all":
            return self._objectives
        return tuple(o for o in self._objectives if o.state.lower() == state.lower())
