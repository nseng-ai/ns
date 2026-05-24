"""``objective list`` read-only Objective status over local git facts."""

from __future__ import annotations

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure
from asdl_objectives.context import (
    ObjectiveCliContext,
    ObjectiveCliUnavailable,
    load_objective_context,
)
from asdl_objectives.list_branch_slices import (
    ObjectiveBranchSlice,
    build_objective_branch_slices,
)
from asdl_objectives.list_inventory import (
    ObjectiveBranchInventory,
    branch_ref,
    branches_to_scan,
    build_objective_branch_inventory,
)
from asdl_objectives.list_models import (
    ObjectiveBranchEntry,
    ObjectiveListGroup,
    ObjectiveListRequest,
    ObjectiveListResult,
    ObjectiveListView,
    ObjectiveStatusSourceEntry,
)
from asdl_objectives.list_render import (
    render_objective_list_human,
    render_objective_list_markdown,
)
from asdl_objectives.list_status import (
    ObjectiveStatusFilter,
    ObjectiveStatusProjectionEntry,
    ObjectiveStatusSource,
    project_objective_statuses,
    select_status_source,
)
from asdl_objectives.list_touches import ObjectivePathTouchIndex, build_objective_touch_index
from asdl_objectives.list_updates import (
    ObjectiveTouchCandidate,
    attribute_latest_objective_update,
    touch_updated_iso,
)


@clinkr_operation(
    name="list",
    help="List Objective status from base/current status and local work branches.",
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
            view=request.view,
            status_filter=request.status,
            filter_current=request.current,
            names_only=request.names,
        )
    )


def build_objective_list_result(
    ctx: ObjectiveCliContext,
    *,
    view: ObjectiveListView = "list",
    status_filter: ObjectiveStatusFilter = "active",
    filter_current: bool = False,
    names_only: bool = False,
) -> ObjectiveListResult:
    base_branch = ctx.trunk_branch
    current_branch = _resolve_current_branch(ctx) if filter_current else None
    source = select_status_source(
        base_branch=base_branch,
        filter_current=filter_current,
        current_branch=current_branch,
    )
    if filter_current and source.status_source_branch is None:
        return _empty_result(
            base_branch=base_branch,
            status_source=source.status_source,
            status_source_branch=None,
            view=view,
            status_filter=status_filter,
            current_branch=None,
            filtered_to_current=True,
            names_only=names_only,
        )

    local_branches = tuple(tip.name for tip in ctx.git.list_local_branch_tips())
    scan_branches = branches_to_scan(
        local_branches,
        base_branch=base_branch,
        status_source_branch=source.status_source_branch,
    )
    inventory = build_objective_branch_inventory(ctx.git, scan_branches)
    projection = project_objective_statuses(
        inventory,
        local_branches=local_branches,
        base_branch=base_branch,
        source=source,
        status_filter=status_filter,
    )
    if not projection.entries:
        groups: tuple[ObjectiveListGroup, ...] = ()
    elif names_only:
        groups = tuple(_build_names_only_group(entry) for entry in projection.entries)
    else:
        status_source_branch = projection.source.status_source_branch
        assert status_source_branch is not None
        branch_slices = build_objective_branch_slices(
            ctx.git,
            local_branches=local_branches,
            base_branch=base_branch,
        )
        touch_index = build_objective_touch_index(
            ctx.git,
            status_source_branch=status_source_branch,
            branch_slices=branch_slices,
            projected_slugs=tuple(entry.slug for entry in projection.entries),
            inventory=inventory,
        )
        groups = tuple(
            _build_objective_group(
                ctx.git,
                projection_entry=entry,
                inventory=inventory,
                branch_slices=branch_slices,
                touch_index=touch_index,
            )
            for entry in projection.entries
        )

    return ObjectiveListResult(
        base_branch=base_branch,
        trunk_branch=base_branch,
        status_source=projection.source.status_source,
        status_source_branch=projection.source.status_source_branch,
        view=view,
        status_filter=status_filter,
        current_branch=projection.source.current_branch,
        filtered_to_current=projection.source.filtered_to_current,
        names_only=names_only,
        groups=groups,
    )


def _resolve_current_branch(ctx: ObjectiveCliContext) -> str | None:
    current_result = ctx.git.get_current_branch(ctx.repo_root)
    if isinstance(current_result, GitCommandFailure):
        raise ClinkrFailure(
            error_type="git_current_branch_failed",
            message=current_result.message,
        )
    if isinstance(current_result, str):
        return current_result
    return None


def _empty_result(
    *,
    base_branch: str,
    status_source: ObjectiveStatusSource,
    status_source_branch: str | None,
    view: ObjectiveListView,
    status_filter: ObjectiveStatusFilter,
    current_branch: str | None,
    filtered_to_current: bool,
    names_only: bool,
) -> ObjectiveListResult:
    return ObjectiveListResult(
        base_branch=base_branch,
        trunk_branch=base_branch,
        status_source=status_source,
        status_source_branch=status_source_branch,
        view=view,
        status_filter=status_filter,
        current_branch=current_branch,
        filtered_to_current=filtered_to_current,
        names_only=names_only,
        groups=(),
    )


def _build_names_only_group(entry: ObjectiveStatusProjectionEntry) -> ObjectiveListGroup:
    return ObjectiveListGroup(
        slug=entry.slug,
        status=entry.status,
        status_source_entry=ObjectiveStatusSourceEntry(
            branch=entry.status_source_branch,
            status=entry.status,
            updated_iso=None,
            present=entry.present_on_status_source,
        ),
        branches=(),
        latest_update_iso=None,
        latest_work_branch=None,
    )


def _build_objective_group(
    git: GitGateway,
    *,
    projection_entry: ObjectiveStatusProjectionEntry,
    inventory: ObjectiveBranchInventory,
    branch_slices: tuple[ObjectiveBranchSlice, ...],
    touch_index: ObjectivePathTouchIndex,
) -> ObjectiveListGroup:
    source_touch = touch_index.source_touches.get(projection_entry.slug)
    source_entry = ObjectiveStatusSourceEntry(
        branch=projection_entry.status_source_branch,
        status=projection_entry.status,
        updated_iso=touch_updated_iso(source_touch),
        present=projection_entry.present_on_status_source,
    )

    branch_entries: list[ObjectiveBranchEntry] = []
    touch_candidates: list[ObjectiveTouchCandidate] = []
    if source_touch is not None:
        touch_candidates.append(
            ObjectiveTouchCandidate(
                branch=projection_entry.status_source_branch,
                ref_name=branch_ref(projection_entry.status_source_branch),
                touch=source_touch,
                is_work_branch=False,
            )
        )

    for branch_slice in branch_slices:
        branch = branch_slice.branch
        branch_status = inventory.status_on_branch(branch, projection_entry.slug)
        if branch_status is None:
            continue
        branch_touch = touch_index.slice_touches_by_branch_slug.get((branch, projection_entry.slug))
        if branch_touch is None:
            continue
        branch_entries.append(
            ObjectiveBranchEntry(
                branch=branch,
                parent_branch=branch_slice.parent_branch,
                status=branch_status,
                updated_iso=touch_updated_iso(branch_touch),
                slice_commits=branch_slice.slice_commits,
            )
        )
        touch_candidates.append(
            ObjectiveTouchCandidate(
                branch=branch,
                ref_name=branch_ref(branch),
                touch=branch_touch,
                is_work_branch=True,
            )
        )

    attribution = attribute_latest_objective_update(git, tuple(touch_candidates))
    return ObjectiveListGroup(
        slug=projection_entry.slug,
        status=projection_entry.status,
        status_source_entry=source_entry,
        branches=tuple(branch_entries),
        latest_update_iso=attribution.latest_update_iso,
        latest_work_branch=attribution.latest_work_branch,
    )
