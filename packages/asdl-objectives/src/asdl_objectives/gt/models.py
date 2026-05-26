"""Request and result models for ``objective gt`` commands."""

from __future__ import annotations

from typing import Literal

from asdl_core.clinkr.models import ClinkrModel
from asdl_objectives.gt_stack_models import (
    ObjectiveStackBranchRow,
    ObjectiveStackGroup,
    ObjectiveStackProjection,
    ObjectiveStackSegment,
)

ObjectiveGtStackStatus = Literal["open", "closed", "in-flight"]


class ObjectiveGtStacksRequest(ClinkrModel):
    """Request model for ``objective gt stacks``."""


class ObjectiveGtLatestWork(ClinkrModel):
    branch: str
    committed_iso: str
    oid: str


class ObjectiveGtStackRow(ClinkrModel):
    branch: str
    parent: str | None
    depth: int
    touches_objective: bool
    connector: bool
    also_touches: tuple[str, ...]
    validation_result: str | None


class ObjectiveGtStackSegment(ClinkrModel):
    index: int
    rows: tuple[ObjectiveGtStackRow, ...]


class ObjectiveGtStackObjective(ClinkrModel):
    slug: str
    status: ObjectiveGtStackStatus
    objective_branch_count: int
    segment_count: int
    latest_work: ObjectiveGtLatestWork | None
    segments: tuple[ObjectiveGtStackSegment, ...]


class ObjectiveGtStacksResult(ClinkrModel):
    trunk_branch: str
    warnings: tuple[str, ...]
    objectives: tuple[ObjectiveGtStackObjective, ...]


def result_from_projection(projection: ObjectiveStackProjection) -> ObjectiveGtStacksResult:
    return ObjectiveGtStacksResult(
        trunk_branch=projection.trunk,
        warnings=projection.warnings,
        objectives=tuple(_objective_from_group(group) for group in projection.groups),
    )


def _objective_from_group(group: ObjectiveStackGroup) -> ObjectiveGtStackObjective:
    return ObjectiveGtStackObjective(
        slug=group.slug,
        status=group.status,
        objective_branch_count=group.objective_branch_count,
        segment_count=len(group.segments),
        latest_work=_latest_work_from_group(group),
        segments=tuple(
            _segment_from_projection(index, segment)
            for index, segment in enumerate(group.segments, start=1)
        ),
    )


def _latest_work_from_group(group: ObjectiveStackGroup) -> ObjectiveGtLatestWork | None:
    if (
        group.latest_branch is None
        or group.latest_committed_iso is None
        or group.latest_oid is None
    ):
        return None
    return ObjectiveGtLatestWork(
        branch=group.latest_branch,
        committed_iso=group.latest_committed_iso,
        oid=group.latest_oid,
    )


def _segment_from_projection(
    index: int,
    segment: ObjectiveStackSegment,
) -> ObjectiveGtStackSegment:
    return ObjectiveGtStackSegment(
        index=index,
        rows=tuple(_row_from_projection(row) for row in segment.rows),
    )


def _row_from_projection(row: ObjectiveStackBranchRow) -> ObjectiveGtStackRow:
    return ObjectiveGtStackRow(
        branch=row.branch,
        parent=row.parent,
        depth=row.depth,
        touches_objective=row.touches_objective,
        connector=not row.touches_objective,
        also_touches=row.also_touches,
        validation_result=row.validation_result,
    )
