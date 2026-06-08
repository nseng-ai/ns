"""``objective list`` read-only checkout-local Objective records."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import GitCommandFailure, LocalBranchTip, PathChangeTouch
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
from asdl_objectives.objective_paths import (
    ACTIVE_OBJECTIVE_ROOT,
    active_objective_record_path,
    objective_slug_from_active_path,
)


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
        names_only=request.names,
        include_updated_branches=not request.names and not request.minimal,
    )
    if isinstance(result, GitCommandFailure):
        return ClinkrExit.failure(error_type=result.error_type, message=result.message)
    return ClinkrExit.ok(result)


def build_objective_list_result(
    ctx: ObjectiveCliContext,
    *,
    status_filter: ObjectiveStatusFilter = "active",
    names_only: bool = False,
    include_updated_branches: bool = False,
) -> ObjectiveListResult:
    result = _build_objective_list_result_or_failure(
        ctx,
        status_filter=status_filter,
        names_only=names_only,
        include_updated_branches=include_updated_branches,
    )
    if isinstance(result, GitCommandFailure):
        raise RuntimeError(result.message)
    return result


def _build_objective_list_result_or_failure(
    ctx: ObjectiveCliContext,
    *,
    status_filter: ObjectiveStatusFilter = "active",
    names_only: bool = False,
    include_updated_branches: bool = False,
) -> ObjectiveListResult | GitCommandFailure:
    if names_only and include_updated_branches:
        return GitCommandFailure(
            message="Objective list names-only output cannot include updated branch attribution.",
            returncode=None,
            error_type="invalid_request",
        )

    inventory = build_objective_checkout_inventory(ctx.repo_root)
    filtered_records = tuple(
        record
        for record in inventory.records
        if matches_status_filter(record.status, status_filter)
    )
    slugs = tuple(record.slug for record in filtered_records)
    include_branch_attribution = include_updated_branches and not names_only
    updated_branches_by_slug: dict[str, tuple[str, ...]] = {}
    if include_branch_attribution and slugs:
        updated_branches_result = _build_updated_branches_by_slug(ctx, frozenset(slugs))
        if isinstance(updated_branches_result, GitCommandFailure):
            return updated_branches_result
        updated_branches_by_slug = updated_branches_result

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
        names_only=names_only,
        updated_branches_included=include_branch_attribution,
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


def _build_updated_branches_by_slug(
    ctx: ObjectiveCliContext,
    slugs: frozenset[str],
) -> dict[str, tuple[str, ...]] | GitCommandFailure:
    branches = _local_non_trunk_branches(ctx)
    if not branches:
        return {slug: () for slug in slugs}

    updated_branches_by_slug: dict[str, list[str]] = {slug: [] for slug in slugs}
    objective_root = ACTIVE_OBJECTIVE_ROOT.as_posix()
    changed_branches = _branches_with_objective_tree_changes(ctx, branches, objective_root)
    if isinstance(changed_branches, GitCommandFailure):
        return changed_branches

    for branch in changed_branches:
        touches = ctx.git.path_touches_under(f"{ctx.trunk_branch}..{branch}", objective_root)
        if isinstance(touches, GitCommandFailure):
            return touches

        for slug in sorted(_objective_slugs_from_touches(touches, slugs)):
            updated_branches_by_slug[slug].append(branch)

    return {slug: tuple(branch_names) for slug, branch_names in updated_branches_by_slug.items()}


def _objective_slugs_from_touches(
    touches: tuple[PathChangeTouch, ...],
    slugs: frozenset[str],
) -> set[str]:
    touched_slugs: set[str] = set()
    for touch in touches:
        for path in touch.paths:
            slug = objective_slug_from_active_path(path)
            if slug in slugs:
                touched_slugs.add(slug)
    return touched_slugs


def _local_non_trunk_branches(ctx: ObjectiveCliContext) -> tuple[str, ...]:
    branch_tips = sorted(
        (tip for tip in ctx.git.list_local_branch_tips() if tip.name != ctx.trunk_branch),
        key=lambda tip: (_branch_tip_age(tip), tip.name),
    )
    return tuple(tip.name for tip in branch_tips)


def _branch_tip_age(tip: LocalBranchTip) -> timedelta:
    return datetime.max.replace(tzinfo=UTC) - _branch_tip_datetime(tip)


def _branch_tip_datetime(tip: LocalBranchTip) -> datetime:
    if tip.head_iso is None:
        return datetime.min.replace(tzinfo=UTC)
    parsed = datetime.fromisoformat(tip.head_iso)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _branches_with_objective_tree_changes(
    ctx: ObjectiveCliContext,
    branches: tuple[str, ...],
    objective_root: str,
) -> tuple[str, ...] | GitCommandFailure:
    refs = (ctx.trunk_branch, *branches)
    tree_oids = ctx.git.tree_oids_at_refs(refs, objective_root)
    if isinstance(tree_oids, GitCommandFailure):
        return tree_oids

    trunk_tree_oid = tree_oids.get(ctx.trunk_branch)
    return tuple(branch for branch in branches if tree_oids.get(branch) != trunk_tree_oid)
