"""Local branch attribution for ``objective list`` records."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure, LocalBranchTip, PathChangeTouch
from asdl_objectives.list_updates import parse_iso_datetime
from asdl_objectives.objective_storage import (
    active_root_relative_path,
    objective_slug_from_active_path,
)

MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS: Final = 50


@dataclass(frozen=True)
class ObjectiveBranchAttribution:
    updated_branches_by_slug: dict[str, tuple[str, ...]]
    truncated: bool = False


def build_objective_branch_attribution(
    git: GitGateway,
    *,
    trunk_branch: str,
    slugs: frozenset[str],
    max_branch_walks: int = MAX_UPDATED_BRANCH_ATTRIBUTION_WALKS,
) -> ObjectiveBranchAttribution | GitCommandFailure:
    if not slugs:
        return ObjectiveBranchAttribution(updated_branches_by_slug={})

    updated_branches_by_slug: dict[str, list[str]] = {slug: [] for slug in slugs}
    branches = _local_non_trunk_branches(git, trunk_branch=trunk_branch)
    if not branches:
        return _attribution_from_lists(updated_branches_by_slug)

    objective_root = active_root_relative_path().as_posix()
    changed_branches = _branches_with_objective_tree_changes(
        git,
        trunk_branch=trunk_branch,
        branches=branches,
        objective_root=objective_root,
    )
    if isinstance(changed_branches, GitCommandFailure):
        return changed_branches

    walked_branches = changed_branches[:max_branch_walks]
    truncated = len(changed_branches) > max_branch_walks
    for branch in walked_branches:
        touches = git.path_touches_under(f"{trunk_branch}..{branch}", objective_root)
        if isinstance(touches, GitCommandFailure):
            return touches

        for slug in sorted(_objective_slugs_from_touches(touches, slugs)):
            updated_branches_by_slug[slug].append(branch)

    return _attribution_from_lists(updated_branches_by_slug, truncated=truncated)


def _attribution_from_lists(
    updated_branches_by_slug: dict[str, list[str]],
    *,
    truncated: bool = False,
) -> ObjectiveBranchAttribution:
    return ObjectiveBranchAttribution(
        updated_branches_by_slug={
            slug: tuple(branch_names) for slug, branch_names in updated_branches_by_slug.items()
        },
        truncated=truncated,
    )


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


def _local_non_trunk_branches(
    git: GitGateway,
    *,
    trunk_branch: str,
) -> tuple[str, ...]:
    branch_tips = sorted(
        (tip for tip in git.list_local_branch_tips() if tip.name != trunk_branch),
        key=_branch_tip_sort_key,
    )
    return tuple(tip.name for tip in branch_tips)


def _branch_tip_sort_key(tip: LocalBranchTip) -> tuple[int, float, str]:
    if tip.head_iso is None:
        return (1, 0.0, tip.name)
    parsed = parse_iso_datetime(tip.head_iso)
    if parsed is None:
        return (1, 0.0, tip.name)
    return (0, -parsed.timestamp(), tip.name)


def _branches_with_objective_tree_changes(
    git: GitGateway,
    *,
    trunk_branch: str,
    branches: tuple[str, ...],
    objective_root: str,
) -> tuple[str, ...] | GitCommandFailure:
    refs = (trunk_branch, *branches)
    tree_oids = git.tree_oids_at_refs(refs, objective_root)
    if isinstance(tree_oids, GitCommandFailure):
        return tree_oids

    trunk_tree_oid = tree_oids.get(trunk_branch)
    return tuple(branch for branch in branches if tree_oids.get(branch) != trunk_tree_oid)
