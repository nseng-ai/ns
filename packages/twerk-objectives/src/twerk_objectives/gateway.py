"""GitHub gateway for objective operations."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class ObjectiveIssueSummary:
    """Lightweight summary of a GitHub issue backing an objective."""

    number: int
    title: str
    state: str
    updated_at: str

    def to_json_dict(self) -> dict[str, str | int]:
        return {
            "number": self.number,
            "title": self.title,
            "state": self.state,
            "updated_at": self.updated_at,
        }


class ObjectivesGitHub(ABC):
    @abstractmethod
    def list_objectives(self, *, state: str = "open") -> tuple[ObjectiveIssueSummary, ...]: ...
