"""Objective status projection for ``objective list``."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from asdl_objectives.list_inventory import ObjectiveBranchInventory, ObjectiveRecordStatus

ObjectiveStatus = Literal["open", "closed", "in-flight"]
ObjectiveStatusFilter = Literal["all", "active", "open", "closed", "in-flight"]
ObjectiveStatusSource = Literal["base", "current"]


@dataclass(frozen=True)
class ObjectiveStatusSourceSelection:
    status_source: ObjectiveStatusSource
    status_source_branch: str | None
    current_branch: str | None
    filtered_to_current: bool


@dataclass(frozen=True)
class ObjectiveStatusProjectionEntry:
    slug: str
    status: ObjectiveStatus
    status_source_branch: str
    status_source_record_status: ObjectiveRecordStatus | None
    present_on_status_source: bool


@dataclass(frozen=True)
class ObjectiveStatusProjection:
    source: ObjectiveStatusSourceSelection
    entries: tuple[ObjectiveStatusProjectionEntry, ...]


def select_status_source(
    *,
    base_branch: str,
    filter_current: bool,
    current_branch: str | None,
) -> ObjectiveStatusSourceSelection:
    if filter_current:
        return ObjectiveStatusSourceSelection(
            status_source="current",
            status_source_branch=current_branch,
            current_branch=current_branch,
            filtered_to_current=True,
        )

    return ObjectiveStatusSourceSelection(
        status_source="base",
        status_source_branch=base_branch,
        current_branch=None,
        filtered_to_current=False,
    )


def project_objective_statuses(
    inventory: ObjectiveBranchInventory,
    *,
    local_branches: tuple[str, ...],
    base_branch: str,
    source: ObjectiveStatusSourceSelection,
    status_filter: ObjectiveStatusFilter,
) -> ObjectiveStatusProjection:
    if source.status_source_branch is None:
        return ObjectiveStatusProjection(source=source, entries=())

    entries: list[ObjectiveStatusProjectionEntry] = []
    for slug in _candidate_slugs(
        inventory,
        local_branches=local_branches,
        base_branch=base_branch,
        source=source,
    ):
        source_record_status = inventory.status_on_branch(source.status_source_branch, slug)
        status = _source_status(
            slug,
            inventory=inventory,
            local_branches=local_branches,
            base_branch=base_branch,
            source=source,
        )
        if status is None or not matches_status_filter(status, status_filter):
            continue
        entries.append(
            ObjectiveStatusProjectionEntry(
                slug=slug,
                status=status,
                status_source_branch=source.status_source_branch,
                status_source_record_status=source_record_status,
                present_on_status_source=source_record_status is not None,
            )
        )

    return ObjectiveStatusProjection(source=source, entries=tuple(entries))


def matches_status_filter(status: ObjectiveStatus, status_filter: ObjectiveStatusFilter) -> bool:
    if status_filter == "all":
        return True
    if status_filter == "active":
        return status in {"open", "in-flight"}
    return status == status_filter


def _candidate_slugs(
    inventory: ObjectiveBranchInventory,
    *,
    local_branches: tuple[str, ...],
    base_branch: str,
    source: ObjectiveStatusSourceSelection,
) -> tuple[str, ...]:
    if source.filtered_to_current:
        if source.status_source_branch is None:
            return ()
        return inventory.slugs_on_branch(source.status_source_branch)

    slugs = set(inventory.slugs_on_branch(base_branch))
    for branch in local_branches:
        if branch == base_branch:
            continue
        slugs.update(inventory.slugs_on_branch(branch))
    return tuple(sorted(slugs))


def _source_status(
    slug: str,
    *,
    inventory: ObjectiveBranchInventory,
    local_branches: tuple[str, ...],
    base_branch: str,
    source: ObjectiveStatusSourceSelection,
) -> ObjectiveStatus | None:
    if source.status_source_branch is None:
        return None

    source_record_status = inventory.status_on_branch(source.status_source_branch, slug)
    if source_record_status is not None:
        return source_record_status
    if source.filtered_to_current:
        return None

    for branch in local_branches:
        if branch != base_branch and inventory.branch_has_slug(branch, slug):
            return "in-flight"
    return None
