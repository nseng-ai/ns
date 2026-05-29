"""``objective list`` read-only checkout-local Objective records."""

from __future__ import annotations

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_objectives.context import (
    ObjectiveCliContext,
    ObjectiveCliUnavailable,
    load_objective_context,
)
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
    return ClinkrExit.ok(
        build_objective_list_result(
            objective_ctx,
            status_filter=request.status,
            names_only=request.names,
        )
    )


def build_objective_list_result(
    ctx: ObjectiveCliContext,
    *,
    status_filter: ObjectiveStatusFilter = "active",
    names_only: bool = False,
) -> ObjectiveListResult:
    inventory = build_objective_checkout_inventory(ctx.repo_root)
    records = tuple(
        _build_objective_list_record(ctx, record.slug, record.status)
        for record in inventory.records
        if matches_status_filter(record.status, status_filter)
    )
    return ObjectiveListResult(
        trunk_branch=ctx.trunk_branch,
        root_path=ACTIVE_OBJECTIVE_ROOT.as_posix(),
        status_filter=status_filter,
        names_only=names_only,
        records=records,
    )


def _build_objective_list_record(
    ctx: ObjectiveCliContext,
    slug: str,
    status: ObjectiveRecordStatus,
) -> ObjectiveListRecord:
    relative_path = active_objective_record_path(slug).as_posix()
    touch = ctx.git.path_last_touched("HEAD", relative_path)
    return ObjectiveListRecord.create(
        slug=slug,
        status=status,
        latest_update_iso=touch_updated_iso(touch),
        has_outstanding_changes=ctx.git.has_uncommitted_changes_under(
            ctx.repo_root,
            relative_path,
        ),
    )
