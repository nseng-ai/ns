"""Pydantic DTOs for ``objective gt stacks``."""

from __future__ import annotations

from typing import Literal, Self

from asdl_core.clinkr.models import ClinkrModel
from asdl_objectives.gt_stack_projection import (
    ObjectiveGtStackGroup,
    ObjectiveGtStackLatestWork,
    ObjectiveGtStackProjection,
    ObjectiveGtStackRow,
    ObjectiveGtStackSegment,
)

ObjectiveGtStackStatus = Literal["open", "closed", "in-flight"]


class ObjectiveGtStacksRequest(ClinkrModel):
    """Request for ``objective gt stacks``.

    The command has no positional arguments. The explicit empty request model lets Clinkr inject
    shared ``--format`` and ``--json-schema`` options while keeping the input schema stable.
    """


class ObjectiveGtStacksLatestWork(ClinkrModel):
    branch: str
    committed_iso: str
    oid: str

    @classmethod
    def from_projection(cls, latest_work: ObjectiveGtStackLatestWork) -> Self:
        return cls(
            branch=latest_work.branch,
            committed_iso=latest_work.committed_iso,
            oid=latest_work.oid,
        )


class ObjectiveGtStacksRow(ClinkrModel):
    branch: str
    parent: str | None
    depth: int
    touches_objective: bool
    connector: bool
    also_touches: tuple[str, ...]
    validation_result: str | None
    needs_restack: bool

    @classmethod
    def from_projection(cls, row: ObjectiveGtStackRow) -> Self:
        return cls(
            branch=row.branch,
            parent=row.parent,
            depth=row.depth,
            touches_objective=row.touches_objective,
            connector=row.connector,
            also_touches=row.also_touches,
            validation_result=row.validation_result,
            needs_restack=row.needs_restack,
        )


class ObjectiveGtStacksSegment(ClinkrModel):
    index: int
    rows: tuple[ObjectiveGtStacksRow, ...]

    @classmethod
    def from_projection(cls, segment: ObjectiveGtStackSegment) -> Self:
        return cls(
            index=segment.index,
            rows=tuple(ObjectiveGtStacksRow.from_projection(row) for row in segment.rows),
        )


class ObjectiveGtStacksObjective(ClinkrModel):
    slug: str
    status: ObjectiveGtStackStatus
    objective_branch_count: int
    segment_count: int
    latest_work: ObjectiveGtStacksLatestWork | None
    segments: tuple[ObjectiveGtStacksSegment, ...]

    @classmethod
    def from_projection(cls, objective: ObjectiveGtStackGroup) -> Self:
        latest_work = None
        if objective.latest_work is not None:
            latest_work = ObjectiveGtStacksLatestWork.from_projection(objective.latest_work)
        return cls(
            slug=objective.slug,
            status=objective.status,
            objective_branch_count=objective.objective_branch_count,
            segment_count=objective.segment_count,
            latest_work=latest_work,
            segments=tuple(
                ObjectiveGtStacksSegment.from_projection(segment) for segment in objective.segments
            ),
        )


class ObjectiveGtStacksResult(ClinkrModel):
    trunk_branch: str
    warnings: tuple[str, ...]
    objectives: tuple[ObjectiveGtStacksObjective, ...]

    @classmethod
    def from_projection(cls, projection: ObjectiveGtStackProjection) -> Self:
        return cls(
            trunk_branch=projection.trunk_branch,
            warnings=projection.warnings,
            objectives=tuple(
                ObjectiveGtStacksObjective.from_projection(objective)
                for objective in projection.objectives
            ),
        )
