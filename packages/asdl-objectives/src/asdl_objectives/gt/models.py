"""Clinkr wire models for ``objective gt stacks``.

A thin serialization boundary: the request (empty — only ``--format`` /
``--json-schema`` are auto-injected) and a ``ClinkrModel`` result tree that
structurally mirrors the projection dataclass tree. ``result_from_projection``
is the ONE mapper and does a field-by-field copy: it never recomputes
``connector`` or any other field.
"""

from __future__ import annotations

from asdl_core.clinkr.models import ClinkrModel
from asdl_objectives.gt.projection import (
    ObjectiveStackGroup,
    ObjectiveStackLatestWork,
    ObjectiveStackProjection,
    ObjectiveStackRow,
    ObjectiveStackSegment,
)


class ObjectiveGtStacksRequest(ClinkrModel):
    pass


class ObjectiveGtStackRow(ClinkrModel):
    branch: str
    parent: str | None
    depth: int
    touches_objective: bool
    connector: bool
    also_touches: tuple[str, ...]
    validation_result: str | None
    needs_restack: bool


class ObjectiveGtStackSegment(ClinkrModel):
    index: int
    rows: tuple[ObjectiveGtStackRow, ...]


class ObjectiveGtLatestWork(ClinkrModel):
    branch: str
    committed_iso: str
    oid: str


class ObjectiveGtStackObjective(ClinkrModel):
    slug: str
    status: str
    objective_branch_count: int
    segment_count: int
    latest_work: ObjectiveGtLatestWork | None
    segments: tuple[ObjectiveGtStackSegment, ...]


class ObjectiveGtStacksResult(ClinkrModel):
    trunk_branch: str
    warnings: tuple[str, ...]
    objectives: tuple[ObjectiveGtStackObjective, ...]


def result_from_projection(
    projection: ObjectiveStackProjection,
) -> ObjectiveGtStacksResult:
    """Structural field-by-field copy from the projection tree to the wire tree."""
    return ObjectiveGtStacksResult(
        trunk_branch=projection.trunk_branch,
        warnings=projection.warnings,
        objectives=tuple(_objective(group) for group in projection.objectives),
    )


def _objective(group: ObjectiveStackGroup) -> ObjectiveGtStackObjective:
    return ObjectiveGtStackObjective(
        slug=group.slug,
        status=group.status,
        objective_branch_count=group.objective_branch_count,
        segment_count=group.segment_count,
        latest_work=_latest_work(group.latest_work),
        segments=tuple(_segment(segment) for segment in group.segments),
    )


def _latest_work(
    latest_work: ObjectiveStackLatestWork | None,
) -> ObjectiveGtLatestWork | None:
    if latest_work is None:
        return None
    return ObjectiveGtLatestWork(
        branch=latest_work.branch,
        committed_iso=latest_work.committed_iso,
        oid=latest_work.oid,
    )


def _segment(segment: ObjectiveStackSegment) -> ObjectiveGtStackSegment:
    return ObjectiveGtStackSegment(
        index=segment.index,
        rows=tuple(_row(row) for row in segment.rows),
    )


def _row(row: ObjectiveStackRow) -> ObjectiveGtStackRow:
    return ObjectiveGtStackRow(
        branch=row.branch,
        parent=row.parent,
        depth=row.depth,
        touches_objective=row.touches_objective,
        connector=row.connector,
        also_touches=row.also_touches,
        validation_result=row.validation_result,
        needs_restack=row.needs_restack,
    )
