"""Batched Objective path-touch indexing for ``objective list``."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure, PathChangeTouch, PathTouch
from asdl_objectives.list_branch_inventory import (
    OBJECTIVE_ROOT,
    ObjectiveBranchInventory,
    branch_ref,
)
from asdl_objectives.list_branch_slices import ObjectiveBranchSlice
from asdl_objectives.objective_paths import objective_slug_from_active_path


@dataclass(frozen=True)
class ObjectivePathTouchIndex:
    source_touches: dict[str, PathTouch]
    slice_touches_by_branch_slug: dict[tuple[str, str], PathTouch]


def build_objective_touch_index(
    git: GitGateway,
    *,
    status_source_branch: str,
    branch_slices: tuple[ObjectiveBranchSlice, ...],
    projected_slugs: tuple[str, ...],
    inventory: ObjectiveBranchInventory,
) -> ObjectivePathTouchIndex:
    source_touches = _path_touches_under_or_raise(git, branch_ref(status_source_branch))
    source_touches_by_slug = _latest_touches_by_slug(source_touches, projected_slugs)

    slice_touches_by_branch_slug: dict[tuple[str, str], PathTouch] = {}
    for branch_slice in branch_slices:
        branch_slugs = tuple(
            slug for slug in projected_slugs if inventory.branch_has_slug(branch_slice.branch, slug)
        )
        if not branch_slugs:
            continue
        branch_touches = _path_touches_under_or_raise(git, branch_slice.range_spec)
        for slug, touch in _latest_touches_by_slug(branch_touches, branch_slugs).items():
            slice_touches_by_branch_slug[(branch_slice.branch, slug)] = touch

    return ObjectivePathTouchIndex(
        source_touches=source_touches_by_slug,
        slice_touches_by_branch_slug=slice_touches_by_branch_slug,
    )


def _path_touches_under_or_raise(
    git: GitGateway,
    ref_or_range: str,
) -> tuple[PathChangeTouch, ...]:
    result = git.path_touches_under(ref_or_range, OBJECTIVE_ROOT)
    if isinstance(result, GitCommandFailure):
        raise ClinkrFailure(
            error_type="git_objective_touches_failed",
            message=result.message,
        )
    return result


def _latest_touches_by_slug(
    touches: tuple[PathChangeTouch, ...],
    slugs: tuple[str, ...],
) -> dict[str, PathTouch]:
    remaining_slugs = set(slugs)
    touches_by_slug: dict[str, PathTouch] = {}
    if not remaining_slugs:
        return touches_by_slug

    for touch in touches:
        touched_slugs = {
            slug
            for path in touch.paths
            if (slug := objective_slug_from_path(path)) in remaining_slugs
        }
        for slug in sorted(touched_slugs):
            touches_by_slug[slug] = PathTouch(oid=touch.oid, committed_iso=touch.committed_iso)
            remaining_slugs.remove(slug)
        if not remaining_slugs:
            break
    return touches_by_slug


def objective_slug_from_path(path: str) -> str | None:
    return objective_slug_from_active_path(path)
