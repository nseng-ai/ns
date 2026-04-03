from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from clinkr.machine_command import MachineCommandError


@dataclass(frozen=True)
class ObjectiveListRequest:
    """Request for listing objectives."""


@dataclass(frozen=True)
class ObjectiveSummary:
    slug: str
    title: str

    def to_json_dict(self) -> dict[str, str]:
        return {"slug": self.slug, "title": self.title}


@dataclass(frozen=True)
class ObjectiveListResult:
    objectives: tuple[ObjectiveSummary, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "objectives": [objective.to_json_dict() for objective in self.objectives],
            "count": len(self.objectives),
        }


def run_list_objectives(
    request: ObjectiveListRequest,
) -> ObjectiveListResult | MachineCommandError:
    del request
    return ObjectiveListResult(objectives=())
