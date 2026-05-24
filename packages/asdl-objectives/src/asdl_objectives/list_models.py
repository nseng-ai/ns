"""Request and result models for ``objective list``."""

from __future__ import annotations

from typing import Annotated, Literal

import click

from asdl_core.clinkr.models import ClinkrModel
from asdl_objectives.list_inventory import ObjectiveRecordStatus
from asdl_objectives.list_status import (
    ObjectiveStatus,
    ObjectiveStatusFilter,
    ObjectiveStatusSource,
)

ObjectiveListView = Literal["list", "detail"]


class ObjectiveListRequest(ClinkrModel):
    current: Annotated[
        bool,
        click.Option(
            ["--current"],
            is_flag=True,
            default=False,
            help="Use the current branch as the Objective status source.",
        ),
    ] = False
    names: Annotated[
        bool,
        click.Option(
            ["--names"],
            is_flag=True,
            default=False,
            help="Output Objective slugs only, one per line.",
        ),
    ] = False
    status: Annotated[
        ObjectiveStatusFilter,
        click.Option(
            ["--status"],
            type=click.Choice(["all", "active", "open", "closed", "in-flight"]),
            default="active",
            show_default=True,
            help="Filter Objectives by repository status.",
        ),
    ] = "active"
    view: Annotated[
        ObjectiveListView,
        click.Option(
            ["--view"],
            type=click.Choice(["list", "detail"]),
            default="list",
            show_default=True,
            help="Select objective-level list or per-branch detail view.",
        ),
    ] = "list"


class ObjectiveBranchEntry(ClinkrModel):
    branch: str
    status: ObjectiveRecordStatus
    updated_iso: str | None
    ahead_base: int


class ObjectiveStatusSourceEntry(ClinkrModel):
    branch: str
    status: ObjectiveStatus
    updated_iso: str | None
    present: bool


class ObjectiveListGroup(ClinkrModel):
    slug: str
    status: ObjectiveStatus
    status_source_entry: ObjectiveStatusSourceEntry
    branches: tuple[ObjectiveBranchEntry, ...]
    latest_update_iso: str | None
    latest_work_branch: str | None


class ObjectiveListResult(ClinkrModel):
    base_branch: str
    trunk_branch: str
    status_source: ObjectiveStatusSource
    status_source_branch: str | None
    view: ObjectiveListView
    status_filter: ObjectiveStatusFilter
    current_branch: str | None
    filtered_to_current: bool
    names_only: bool
    groups: tuple[ObjectiveListGroup, ...]
