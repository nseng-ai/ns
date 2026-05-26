"""Request and result models for ``objective list``."""

from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.models import ClinkrModel
from asdl_objectives.list_status import ObjectiveStatus, ObjectiveStatusFilter


class ObjectiveListRequest(ClinkrModel):
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
            type=click.Choice(["all", "active", "open", "closed"]),
            default="active",
            show_default=True,
            help="Filter Objective records by checkout-local status.",
        ),
    ] = "active"


class ObjectiveListRecord(ClinkrModel):
    slug: str
    status: ObjectiveStatus
    latest_update_iso: str | None


class ObjectiveListResult(ClinkrModel):
    trunk_branch: str
    root_path: str
    status_filter: ObjectiveStatusFilter
    names_only: bool
    records: tuple[ObjectiveListRecord, ...]
