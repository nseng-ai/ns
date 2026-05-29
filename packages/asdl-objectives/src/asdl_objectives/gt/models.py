"""Request and result models for ``objective gt`` commands."""

from __future__ import annotations

from typing import Literal

from asdl_core.clinkr.models import ClinkrModel

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
    also_touches: tuple[str, ...]
    validation_result: str | None
    needs_restack: bool


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
