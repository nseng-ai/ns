"""``objective list`` read-only checkout-local Objective records."""

from __future__ import annotations

from typing import Literal

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import GitCommandFailure
from asdl_objectives.context import (
    ObjectiveCliContext,
    ObjectiveCliUnavailable,
    load_objective_context,
)
from asdl_objectives.list_branch_attribution import build_objective_branch_attribution
from asdl_objectives.list_inventory import ObjectiveRecordStatus, build_objective_checkout_inventory
from asdl_objectives.list_models import (
    ObjectiveListRecord,
    ObjectiveListRequest,
    ObjectiveListResult,
)
from asdl_objectives.list_render import (
    render_objective_list_human,
    render_objective_list_markdown,
)
from asdl_objectives.list_status import ObjectiveStatusFilter, matches_status_filter
from asdl_objectives.list_updates import touch_updated_iso
from asdl_objectives.objective_paths import ACTIVE_OBJECTIVE_ROOT, active_objective_record_path

ObjectiveListMode = Literal["names", "minimal", "with_updated_branches"]


@clinkr_operation(
    name="list",
    help="List Objective records in the current checkout.",
    human_renderer=render_objective_list_human,
    markdown_renderer=render_objective_list_markdown,
)
def run_list_objectives(
    ctx: click.Context,
    request: ObjectiveListRequest,
) -> ClinkrExit[ObjectiveListResult]:
    objective_ctx = load_objective_context(ctx)
    if isinstance(objective_ctx, ObjectiveCliUnavailable):
        return ClinkrExit.failure(error_type="not_in_repo", message=objective_ctx.message)

    result = _build_objective_list_result_or_failure(
        objective_ctx,
        status_filter=request.status,
        mode=_objective_list_mode(request),
    )
    if isinstance(result, GitCommandFailure):
        return ClinkrExit.failure(error_type=result.error_type, message=result.message)
    return ClinkrExit.ok(result)


def build_objective_list_result(
    ctx: ObjectiveCliContext,
    *,
    status_filter: ObjectiveStatusFilter = "active",
    mode: ObjectiveListMode | None = None,
    names_only: bool = False,
    include_updated_branches: bool = False,
) -> ObjectiveListResult:
    result = _build_objective_list_result_or_failure(
        ctx,
        status_filter=status_filter,
        mode=_legacy_objective_list_mode(
            mode,
            names_only=names_only,
            include_updated_branches=include_updated_branches,
        ),
    )
    if isinstance(result, GitCommandFailure):
        raise RuntimeError(result.message)
    return result


def _build_objective_list_result_or_failure(
    ctx: ObjectiveCliContext,
    *,
    status_filter: ObjectiveStatusFilter = "active",
    mode: ObjectiveListMode = "minimal",
) -> ObjectiveListResult | GitCommandFailure:
    inventory = build_objective_checkout_inventory(ctx.repo_root)
    filtered_records = tuple(
        record
        for record in inventory.records
        if matches_status_filter(record.status, status_filter)
    )
    slugs = tuple(record.slug for record in filtered_records)
    include_branch_attribution = mode == "with_updated_branches"
    updated_branches_by_slug: dict[str, tuple[str, ...]] = {}
    updated_branches_truncated = False
    if include_branch_attribution and slugs:
        attribution = build_objective_branch_attribution(
            ctx.git,
            trunk_branch=ctx.trunk_branch,
            slugs=frozenset(slugs),
        )
        if isinstance(attribution, GitCommandFailure):
            return attribution
        updated_branches_by_slug = attribution.updated_branches_by_slug
        updated_branches_truncated = attribution.truncated

    records = tuple(
        _build_objective_list_record(
            ctx,
            record.slug,
            record.status,
            updated_branches=updated_branches_by_slug.get(record.slug),
        )
        for record in filtered_records
    )
    return ObjectiveListResult(
        trunk_branch=ctx.trunk_branch,
        root_path=ACTIVE_OBJECTIVE_ROOT.as_posix(),
        status_filter=status_filter,
        names_only=mode == "names",
        updated_branches_included=include_branch_attribution,
        updated_branches_truncated=updated_branches_truncated,
        records=records,
    )


def _build_objective_list_record(
    ctx: ObjectiveCliContext,
    slug: str,
    status: ObjectiveRecordStatus,
    *,
    updated_branches: tuple[str, ...] | None = None,
) -> ObjectiveListRecord:
    relative_path = active_objective_record_path(slug).as_posix()
    touch = ctx.git.path_last_touched("HEAD", relative_path)
    return ObjectiveListRecord.create(
        slug=slug,
        status=status,
        latest_update_iso=touch_updated_iso(touch),
        updated_branches=updated_branches,
        has_outstanding_changes=ctx.git.has_uncommitted_changes_under(
            ctx.repo_root,
            relative_path,
        ),
    )


def _objective_list_mode(request: ObjectiveListRequest) -> ObjectiveListMode:
    if request.names:
        return "names"
    if request.minimal:
        return "minimal"
    return "with_updated_branches"


def _legacy_objective_list_mode(
    mode: ObjectiveListMode | None,
    *,
    names_only: bool,
    include_updated_branches: bool,
) -> ObjectiveListMode:
    if mode is not None:
        return mode
    if names_only:
        return "names"
    if include_updated_branches:
        return "with_updated_branches"
    return "minimal"
