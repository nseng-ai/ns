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
from asdl_objectives.list_inventory import (
    ObjectiveBranchInventory,
    branch_ref,
    branches_to_scan,
    build_objective_branch_inventory,
    objective_path,
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
    groups = tuple(
        _build_objective_group(
            ctx.git,
            projection_entry=entry,
            inventory=inventory,
            local_branches=local_branches,
            base_branch=base_branch,
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


def _build_objective_group(
    git: GitGateway,
    *,
    projection_entry: ObjectiveStatusProjectionEntry,
    inventory: ObjectiveBranchInventory,
    local_branches: tuple[str, ...],
    base_branch: str,
) -> ObjectiveListGroup:
    source_touch = git.path_last_touched(
        branch_ref(projection_entry.status_source_branch),
        objective_path(projection_entry.slug),
    )
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
                is_work_branch=projection_entry.status_source_branch != base_branch,
            )
        )

    for branch in sorted(local_branches):
        if branch == base_branch:
            continue
        branch_status = inventory.status_on_branch(branch, projection_entry.slug)
        if branch_status is None:
            continue
        branch_touch = git.path_last_touched(
            branch_ref(branch),
            objective_path(projection_entry.slug),
        )
        branch_entries.append(
            ObjectiveBranchEntry(
                branch=branch,
                status=branch_status,
                updated_iso=touch_updated_iso(branch_touch),
                ahead_base=_ahead_base(git, base_branch=base_branch, branch=branch),
            )
        )
        if branch_touch is not None:
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


def _ahead_base(git: GitGateway, *, base_branch: str, branch: str) -> int:
    ahead_result = git.count_commits_in_range(f"{base_branch}..{branch}")
    if isinstance(ahead_result, GitCommandFailure):
        raise ClinkrFailure(
            error_type="git_ahead_count_failed",
            message=ahead_result.message,
        )
    return ahead_result
