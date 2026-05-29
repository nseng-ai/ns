"""Internal Objective stack projection data models."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ObjectiveStackGroupStatus = Literal["open", "closed", "in-flight"]


@dataclass(frozen=True)
class ObjectiveBranchTouch:
    branch: str
    slug: str
    oid: str
    committed_iso: str


@dataclass(frozen=True)
class ObjectiveBranchTouchSummary:
    branch: str
    parent: str
    touched_slugs: tuple[str, ...]
    latest_touch_by_slug: dict[str, ObjectiveBranchTouch]


@dataclass(frozen=True)
class ObjectiveBranchTouchIndex:
    summaries_by_branch: dict[str, ObjectiveBranchTouchSummary]


@dataclass(frozen=True)
class ObjectiveStackBranchRow:
    branch: str
    parent: str | None
    depth: int
    touches_objective: bool
    also_touches: tuple[str, ...]
    validation_result: str | None
    needs_restack: bool = False


@dataclass(frozen=True)
class ObjectiveStackSegment:
    rows: tuple[ObjectiveStackBranchRow, ...]


@dataclass(frozen=True)
class ObjectiveStackGroup:
    slug: str
    status: ObjectiveStackGroupStatus
    objective_branch_count: int
    latest_branch: str | None
    latest_committed_iso: str | None
    latest_oid: str | None
    segments: tuple[ObjectiveStackSegment, ...]


@dataclass(frozen=True)
class ObjectiveStackProjection:
    trunk: str
    groups: tuple[ObjectiveStackGroup, ...]
    warnings: tuple[str, ...]
