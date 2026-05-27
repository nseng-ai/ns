"""Semantic projection for ``objective gt stacks``."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import GitCommandFailure, PathChangeTouch
from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.types import GtBranchGraph, GtCommandFailure, GtTrackedBranch
from asdl_objectives.list_branch_inventory import (
    OBJECTIVE_ROOT,
    branch_ref,
    objective_statuses_from_paths,
)
from asdl_objectives.objective_paths import objective_slug_from_active_path

ObjectiveGtStackStatus = Literal["open", "closed", "in-flight"]


@dataclass(frozen=True)
class ObjectiveGtStackLatestWork:
    branch: str
    committed_iso: str
    oid: str

    def to_json_data(self) -> dict[str, str]:
        return {
            "branch": self.branch,
            "committed_iso": self.committed_iso,
            "oid": self.oid,
        }


@dataclass(frozen=True)
class ObjectiveGtStackRow:
    branch: str
    parent: str | None
    depth: int
    touches_objective: bool
    connector: bool
    also_touches: tuple[str, ...]
    validation_result: str | None
    needs_restack: bool

    def to_json_data(self) -> dict[str, object]:
        return {
            "branch": self.branch,
            "parent": self.parent,
            "depth": self.depth,
            "touches_objective": self.touches_objective,
            "connector": self.connector,
            "also_touches": list(self.also_touches),
            "validation_result": self.validation_result,
            "needs_restack": self.needs_restack,
        }


@dataclass(frozen=True)
class ObjectiveGtStackSegment:
    index: int
    rows: tuple[ObjectiveGtStackRow, ...]

    def to_json_data(self) -> dict[str, object]:
        return {
            "index": self.index,
            "rows": [row.to_json_data() for row in self.rows],
        }


@dataclass(frozen=True)
class ObjectiveGtStackGroup:
    slug: str
    status: ObjectiveGtStackStatus
    objective_branch_count: int
    segment_count: int
    latest_work: ObjectiveGtStackLatestWork | None
    segments: tuple[ObjectiveGtStackSegment, ...]

    def to_json_data(self) -> dict[str, object]:
        latest_work = None
        if self.latest_work is not None:
            latest_work = self.latest_work.to_json_data()
        return {
            "slug": self.slug,
            "status": self.status,
            "objective_branch_count": self.objective_branch_count,
            "segment_count": self.segment_count,
            "latest_work": latest_work,
            "segments": [segment.to_json_data() for segment in self.segments],
        }


@dataclass(frozen=True)
class ObjectiveGtStackProjection:
    trunk_branch: str
    warnings: tuple[str, ...]
    objectives: tuple[ObjectiveGtStackGroup, ...]

    def to_json_data(self) -> dict[str, object]:
        return {
            "trunk_branch": self.trunk_branch,
            "warnings": list(self.warnings),
            "objectives": [objective.to_json_data() for objective in self.objectives],
        }


@dataclass(frozen=True)
class ObjectiveGtStackBranchScope:
    branches_by_name: dict[str, GtTrackedBranch]
    stack_order: tuple[str, ...]
    warnings: tuple[str, ...]


@dataclass(frozen=True)
class ObjectiveGtStackGroupBuild:
    group: ObjectiveGtStackGroup
    warnings: tuple[str, ...]


def build_objective_gt_stack_projection(
    repo_root: Path,
    git: GitGateway,
    gt: GtGateway,
) -> ObjectiveGtStackProjection:
    graph = gt.branch_graph(repo_root)
    if isinstance(graph, GtCommandFailure):
        raise ClinkrFailure(
            error_type="gt_branch_graph_failed",
            message=f"Graphite branch graph failed: {graph.message}",
        )

    scope = _select_branch_scope(git, graph)
    branch_touches_by_branch = _build_branch_touches_by_branch(git, graph.trunk, scope)
    touched_slugs = _touched_slugs(branch_touches_by_branch)
    trunk_status_by_slug = _trunk_status_by_slug(git, graph.trunk, touched_slugs)

    groups: list[ObjectiveGtStackGroup] = []
    group_warnings: list[str] = []
    for slug in touched_slugs:
        build = _build_objective_group(
            slug=slug,
            trunk=graph.trunk,
            trunk_status=trunk_status_by_slug.get(slug),
            scope=scope,
            branch_touches_by_branch=branch_touches_by_branch,
        )
        groups.append(build.group)
        group_warnings.extend(build.warnings)

    warnings = _dedupe_warnings((*graph.warnings, *scope.warnings, *group_warnings))
    return ObjectiveGtStackProjection(
        trunk_branch=graph.trunk,
        warnings=warnings,
        objectives=tuple(groups),
    )


def _select_branch_scope(git: GitGateway, graph: GtBranchGraph) -> ObjectiveGtStackBranchScope:
    graph_branches_by_name = {branch.name: branch for branch in graph.branches}
    trunk = graph_branches_by_name.get(graph.trunk)
    if trunk is None:
        trunk = GtTrackedBranch(
            name=graph.trunk,
            parent=None,
            children=(),
            validation_result=None,
        )

    scoped_branches_by_name: dict[str, GtTrackedBranch] = {graph.trunk: trunk}
    stack_order: list[str] = [graph.trunk]
    warnings: list[str] = []
    visited: set[str] = {graph.trunk}

    def walk_children(parent_name: str) -> None:
        parent = graph_branches_by_name.get(parent_name)
        if parent is None:
            return
        for child_name in parent.children:
            if child_name in visited:
                continue
            visited.add(child_name)
            child = graph_branches_by_name.get(child_name)
            if child is None:
                continue

            child_is_local = git.branch_exists(child.name)
            if child_is_local and _branch_has_scoped_parent(
                child,
                scoped_branches_by_name,
            ):
                scoped_branches_by_name[child.name] = child
                stack_order.append(child.name)
            elif child_is_local and child.parent is not None:
                warnings.append(_skipped_branch_warning(child.name, child.parent))

            walk_children(child.name)

    walk_children(graph.trunk)
    return ObjectiveGtStackBranchScope(
        branches_by_name=scoped_branches_by_name,
        stack_order=tuple(stack_order),
        warnings=_dedupe_warnings(tuple(warnings)),
    )


def _branch_has_scoped_parent(
    branch: GtTrackedBranch,
    scoped_branches_by_name: dict[str, GtTrackedBranch],
) -> bool:
    if branch.parent is None:
        return False
    return branch.parent in scoped_branches_by_name


def _skipped_branch_warning(branch: str, parent: str) -> str:
    return f"Graphite branch '{branch}' has unavailable local parent '{parent}'; skipping."


def _build_branch_touches_by_branch(
    git: GitGateway,
    trunk: str,
    scope: ObjectiveGtStackBranchScope,
) -> dict[str, dict[str, ObjectiveGtStackLatestWork]]:
    touches_by_branch: dict[str, dict[str, ObjectiveGtStackLatestWork]] = {}
    for branch_name in scope.stack_order:
        if branch_name == trunk:
            continue
        branch = scope.branches_by_name[branch_name]
        if branch.parent is None:
            continue

        range_spec = f"{branch.parent}..{branch.name}"
        result = git.path_touches_under(range_spec, OBJECTIVE_ROOT)
        if isinstance(result, GitCommandFailure):
            raise ClinkrFailure(
                error_type="git_objective_stack_touches_failed",
                message=result.message,
            )
        branch_touches = _latest_touches_by_slug(branch.name, result)
        if branch_touches:
            touches_by_branch[branch.name] = branch_touches
    return touches_by_branch


def _latest_touches_by_slug(
    branch: str,
    touches: tuple[PathChangeTouch, ...],
) -> dict[str, ObjectiveGtStackLatestWork]:
    latest_by_slug: dict[str, ObjectiveGtStackLatestWork] = {}
    for touch in touches:
        touched_slugs = sorted(
            {
                slug
                for path in touch.paths
                if (slug := objective_slug_from_active_path(path)) is not None
            }
        )
        for slug in touched_slugs:
            candidate = ObjectiveGtStackLatestWork(
                branch=branch,
                committed_iso=touch.committed_iso,
                oid=touch.oid,
            )
            current = latest_by_slug.get(slug)
            if current is None or _work_sorts_after(candidate, current):
                latest_by_slug[slug] = candidate
    return latest_by_slug


def _touched_slugs(
    branch_touches_by_branch: dict[str, dict[str, ObjectiveGtStackLatestWork]],
) -> tuple[str, ...]:
    return tuple(
        sorted(
            {
                slug
                for branch_touches in branch_touches_by_branch.values()
                for slug in branch_touches
            }
        )
    )


def _trunk_status_by_slug(
    git: GitGateway,
    trunk: str,
    touched_slugs: tuple[str, ...],
) -> dict[str, ObjectiveGtStackStatus]:
    if not touched_slugs:
        return {}

    paths = git.list_tracked_paths_at_ref(branch_ref(trunk), OBJECTIVE_ROOT)
    if isinstance(paths, GitCommandFailure):
        raise ClinkrFailure(
            error_type="git_objective_trunk_status_failed",
            message=paths.message,
        )
    discovered_statuses = dict(objective_statuses_from_paths(paths))
    return {slug: _projected_status_for_slug(slug, discovered_statuses) for slug in touched_slugs}


def _projected_status_for_slug(
    slug: str,
    discovered_statuses: dict[str, Literal["open", "closed"]],
) -> ObjectiveGtStackStatus:
    status = discovered_statuses.get(slug)
    if status is None:
        return "in-flight"
    return status


def _build_objective_group(
    *,
    slug: str,
    trunk: str,
    trunk_status: ObjectiveGtStackStatus | None,
    scope: ObjectiveGtStackBranchScope,
    branch_touches_by_branch: dict[str, dict[str, ObjectiveGtStackLatestWork]],
) -> ObjectiveGtStackGroupBuild:
    objective_branches = tuple(
        branch for branch in scope.stack_order if slug in branch_touches_by_branch.get(branch, {})
    )
    included_branches = set(objective_branches)
    warnings: list[str] = []
    for branch in objective_branches:
        _include_ancestor_connectors(
            slug=slug,
            branch=branch,
            trunk=trunk,
            scope=scope,
            included_branches=included_branches,
            warnings=warnings,
        )

    children_by_parent = _children_by_parent(scope)
    segments = _build_segments(
        slug=slug,
        scope=scope,
        included_branches=included_branches,
        objective_branches=set(objective_branches),
        branch_touches_by_branch=branch_touches_by_branch,
        children_by_parent=children_by_parent,
    )
    latest_work = _latest_work_for_slug(slug, objective_branches, branch_touches_by_branch)
    return ObjectiveGtStackGroupBuild(
        group=ObjectiveGtStackGroup(
            slug=slug,
            status=trunk_status or "in-flight",
            objective_branch_count=len(objective_branches),
            segment_count=len(segments),
            latest_work=latest_work,
            segments=segments,
        ),
        warnings=_dedupe_warnings(tuple(warnings)),
    )


def _include_ancestor_connectors(
    *,
    slug: str,
    branch: str,
    trunk: str,
    scope: ObjectiveGtStackBranchScope,
    included_branches: set[str],
    warnings: list[str],
) -> None:
    visited = {branch}
    current = branch
    while current != trunk:
        branch_info = scope.branches_by_name.get(current)
        if branch_info is None:
            warnings.append(
                f"Objective '{slug}': branch '{current}' references missing Graphite parent "
                f"'{current}'; ancestor walk stopped."
            )
            return

        parent = branch_info.parent
        if parent is None:
            warnings.append(
                f"Objective '{slug}': branch '{current}' has no Graphite parent; "
                "ancestor walk stopped."
            )
            return
        if parent == trunk:
            return
        if parent in visited:
            warnings.append(
                f"Objective '{slug}': cycle detected at Graphite parent '{parent}'; "
                "ancestor walk stopped."
            )
            return
        if parent not in scope.branches_by_name:
            warnings.append(
                f"Objective '{slug}': branch '{current}' references missing Graphite parent "
                f"'{parent}'; ancestor walk stopped."
            )
            return

        included_branches.add(parent)
        visited.add(parent)
        current = parent


def _children_by_parent(scope: ObjectiveGtStackBranchScope) -> dict[str, tuple[str, ...]]:
    children: dict[str, list[str]] = {branch: [] for branch in scope.stack_order}
    order_by_branch = _order_by_branch(scope.stack_order)
    for branch_name in scope.stack_order:
        branch = scope.branches_by_name[branch_name]
        if branch.parent in scope.branches_by_name:
            children.setdefault(branch.parent, []).append(branch.name)
    return {
        parent: tuple(sorted(parent_children, key=lambda child: order_by_branch[child]))
        for parent, parent_children in children.items()
    }


def _build_segments(
    *,
    slug: str,
    scope: ObjectiveGtStackBranchScope,
    included_branches: set[str],
    objective_branches: set[str],
    branch_touches_by_branch: dict[str, dict[str, ObjectiveGtStackLatestWork]],
    children_by_parent: dict[str, tuple[str, ...]],
) -> tuple[ObjectiveGtStackSegment, ...]:
    order_by_branch = _order_by_branch(scope.stack_order)
    roots = [
        branch
        for branch in included_branches
        if scope.branches_by_name[branch].parent not in included_branches
    ]
    roots.sort(key=lambda branch: order_by_branch[branch])

    visited: set[str] = set()
    segments: list[ObjectiveGtStackSegment] = []
    for root in roots:
        rows = _walk_segment_rows(
            slug=slug,
            root=root,
            depth=0,
            scope=scope,
            included_branches=included_branches,
            objective_branches=objective_branches,
            branch_touches_by_branch=branch_touches_by_branch,
            children_by_parent=children_by_parent,
            visited=visited,
        )
        if rows:
            segments.append(ObjectiveGtStackSegment(index=len(segments) + 1, rows=tuple(rows)))

    unvisited_branches = sorted(
        included_branches.difference(visited),
        key=lambda name: order_by_branch[name],
    )
    for branch in unvisited_branches:
        rows = _walk_segment_rows(
            slug=slug,
            root=branch,
            depth=0,
            scope=scope,
            included_branches=included_branches,
            objective_branches=objective_branches,
            branch_touches_by_branch=branch_touches_by_branch,
            children_by_parent=children_by_parent,
            visited=visited,
        )
        if rows:
            segments.append(ObjectiveGtStackSegment(index=len(segments) + 1, rows=tuple(rows)))
    return tuple(segments)


def _walk_segment_rows(
    *,
    slug: str,
    root: str,
    depth: int,
    scope: ObjectiveGtStackBranchScope,
    included_branches: set[str],
    objective_branches: set[str],
    branch_touches_by_branch: dict[str, dict[str, ObjectiveGtStackLatestWork]],
    children_by_parent: dict[str, tuple[str, ...]],
    visited: set[str],
) -> list[ObjectiveGtStackRow]:
    if root in visited or root not in included_branches:
        return []

    visited.add(root)
    branch = scope.branches_by_name[root]
    touches_objective = root in objective_branches
    rows = [
        ObjectiveGtStackRow(
            branch=root,
            parent=_row_parent(branch, scope),
            depth=depth,
            touches_objective=touches_objective,
            connector=not touches_objective,
            also_touches=_also_touches(slug, root, branch_touches_by_branch),
            validation_result=branch.validation_result,
            needs_restack=branch.needs_restack,
        )
    ]
    for child in children_by_parent.get(root, ()):
        rows.extend(
            _walk_segment_rows(
                slug=slug,
                root=child,
                depth=depth + 1,
                scope=scope,
                included_branches=included_branches,
                objective_branches=objective_branches,
                branch_touches_by_branch=branch_touches_by_branch,
                children_by_parent=children_by_parent,
                visited=visited,
            )
        )
    return rows


def _row_parent(branch: GtTrackedBranch, scope: ObjectiveGtStackBranchScope) -> str | None:
    if branch.parent in scope.branches_by_name:
        return branch.parent
    return None


def _also_touches(
    slug: str,
    branch: str,
    branch_touches_by_branch: dict[str, dict[str, ObjectiveGtStackLatestWork]],
) -> tuple[str, ...]:
    return tuple(
        sorted(
            touched_slug
            for touched_slug in branch_touches_by_branch.get(branch, {})
            if touched_slug != slug
        )
    )


def _latest_work_for_slug(
    slug: str,
    objective_branches: tuple[str, ...],
    branch_touches_by_branch: dict[str, dict[str, ObjectiveGtStackLatestWork]],
) -> ObjectiveGtStackLatestWork | None:
    latest: ObjectiveGtStackLatestWork | None = None
    for branch in objective_branches:
        touch = branch_touches_by_branch[branch][slug]
        if latest is None or _work_sorts_after(touch, latest):
            latest = touch
    return latest


def _work_sorts_after(
    candidate: ObjectiveGtStackLatestWork,
    current: ObjectiveGtStackLatestWork,
) -> bool:
    candidate_timestamp = _parse_commit_timestamp(candidate.committed_iso)
    current_timestamp = _parse_commit_timestamp(current.committed_iso)
    if candidate_timestamp is not None and current_timestamp is None:
        return True
    if candidate_timestamp is None and current_timestamp is not None:
        return False
    if candidate_timestamp is not None and current_timestamp is not None:
        if candidate_timestamp != current_timestamp:
            return candidate_timestamp > current_timestamp

    if candidate.branch != current.branch:
        return candidate.branch < current.branch
    return candidate.oid < current.oid


def _parse_commit_timestamp(committed_iso: str) -> datetime | None:
    normalized = committed_iso
    if committed_iso.endswith("Z"):
        normalized = f"{committed_iso[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _order_by_branch(stack_order: tuple[str, ...]) -> dict[str, int]:
    return {branch: index for index, branch in enumerate(stack_order)}


def _dedupe_warnings(warnings: tuple[str, ...]) -> tuple[str, ...]:
    seen: set[str] = set()
    deduped: list[str] = []
    for warning in warnings:
        if warning in seen:
            continue
        seen.add(warning)
        deduped.append(warning)
    return tuple(deduped)
