"""Objective path-touch extraction for Graphite branch slices."""

from __future__ import annotations

from datetime import UTC, datetime

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure, PathChangeTouch
from asdl_core.gt.types import GtBranchGraph
from asdl_objectives.gt_stack_models import (
    ObjectiveBranchTouch,
    ObjectiveBranchTouchIndex,
    ObjectiveBranchTouchSummary,
)
from asdl_objectives.list_branch_inventory import (
    ObjectiveRecordStatus,
    branch_ref,
    objective_statuses_from_paths,
)
from asdl_objectives.objective_paths import ACTIVE_OBJECTIVE_ROOT, objective_slug_from_active_path

OBJECTIVE_ROOT = ACTIVE_OBJECTIVE_ROOT.as_posix()


def build_objective_branch_touch_index(
    git: GitGateway,
    graph: GtBranchGraph,
) -> ObjectiveBranchTouchIndex:
    summaries_by_branch: dict[str, ObjectiveBranchTouchSummary] = {}

    for branch in graph.branches:
        if branch.name == graph.trunk:
            continue
        if branch.parent is None:
            raise ClinkrFailure(
                error_type="objective_stack_branch_parent_missing",
                message=(
                    "Cannot compute Objective touch range for Graphite branch "
                    f"{branch.name!r}: missing parent."
                ),
            )

        range_spec = f"{branch.parent}..{branch.name}"
        touches = _path_touches_under_or_raise(git, range_spec)
        latest_touch_by_slug = _latest_touches_by_slug(branch.name, touches)
        summaries_by_branch[branch.name] = ObjectiveBranchTouchSummary(
            branch=branch.name,
            parent=branch.parent,
            touched_slugs=tuple(sorted(latest_touch_by_slug)),
            latest_touch_by_slug=latest_touch_by_slug,
        )

    return ObjectiveBranchTouchIndex(summaries_by_branch=summaries_by_branch)


def build_objective_trunk_status_index(
    git: GitGateway,
    trunk: str,
) -> dict[str, ObjectiveRecordStatus]:
    paths = git.list_tracked_paths_at_ref(branch_ref(trunk), OBJECTIVE_ROOT)
    if isinstance(paths, GitCommandFailure):
        raise ClinkrFailure(
            error_type="git_objective_stack_status_failed",
            message=paths.message,
        )
    return dict(objective_statuses_from_paths(paths))


def objective_branch_touch_order_key(
    touch: ObjectiveBranchTouch,
) -> tuple[int, datetime, str, str]:
    committed_at = _parse_committed_iso(touch.committed_iso)
    if committed_at is None:
        return (0, datetime.min.replace(tzinfo=UTC), touch.branch, touch.oid)
    return (1, committed_at, touch.branch, touch.oid)


def _path_touches_under_or_raise(
    git: GitGateway,
    ref_or_range: str,
) -> tuple[PathChangeTouch, ...]:
    result = git.path_touches_under(ref_or_range, OBJECTIVE_ROOT)
    if isinstance(result, GitCommandFailure):
        raise ClinkrFailure(
            error_type="git_objective_stack_touches_failed",
            message=result.message,
        )
    return result


def _latest_touches_by_slug(
    branch: str,
    touches: tuple[PathChangeTouch, ...],
) -> dict[str, ObjectiveBranchTouch]:
    latest_touch_by_slug: dict[str, ObjectiveBranchTouch] = {}
    for touch in touches:
        touched_slugs = _active_objective_slugs_from_paths(touch.paths)
        for slug in touched_slugs:
            candidate = ObjectiveBranchTouch(
                branch=branch,
                slug=slug,
                oid=touch.oid,
                committed_iso=touch.committed_iso,
            )
            current = latest_touch_by_slug.get(slug)
            if current is None or objective_branch_touch_order_key(
                candidate
            ) > objective_branch_touch_order_key(current):
                latest_touch_by_slug[slug] = candidate
    return latest_touch_by_slug


def _active_objective_slugs_from_paths(paths: tuple[str, ...]) -> tuple[str, ...]:
    slugs: set[str] = set()
    for path in paths:
        slug = objective_slug_from_active_path(path)
        if slug is not None:
            slugs.add(slug)
    return tuple(sorted(slugs))


def _parse_committed_iso(committed_iso: str) -> datetime | None:
    normalized = (
        committed_iso.removesuffix("Z") + "+00:00" if committed_iso.endswith("Z") else committed_iso
    )
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
