"""Request and result models for ``objective list``."""

from __future__ import annotations

from typing import Annotated, Self

import click
from pydantic import Field, PrivateAttr

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
    minimal: Annotated[
        bool,
        click.Option(
            ["--minimal"],
            is_flag=True,
            default=False,
            help="Hide local branch attribution and show the compact Objective list.",
        ),
    ] = False


class ObjectiveListRecord(ClinkrModel):
    slug: str
    status: ObjectiveStatus
    latest_update_iso: str | None
    updated_branches: tuple[str, ...] | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )

    _has_outstanding_changes: bool = PrivateAttr(default=False)

    @classmethod
    def create(
        cls,
        *,
        slug: str,
        status: ObjectiveStatus,
        latest_update_iso: str | None,
        updated_branches: tuple[str, ...] | None = None,
        has_outstanding_changes: bool = False,
    ) -> Self:
        record = cls(
            slug=slug,
            status=status,
            latest_update_iso=latest_update_iso,
            updated_branches=updated_branches,
        )
        record._has_outstanding_changes = has_outstanding_changes
        return record

    @property
    def has_outstanding_changes(self) -> bool:
        return self._has_outstanding_changes


class ObjectiveListResult(ClinkrModel):
    trunk_branch: str
    root_path: str
    status_filter: ObjectiveStatusFilter
    names_only: bool
    updated_branches_included: bool = Field(
        default=False,
        exclude_if=lambda value: not value,
    )
    records: tuple[ObjectiveListRecord, ...]
