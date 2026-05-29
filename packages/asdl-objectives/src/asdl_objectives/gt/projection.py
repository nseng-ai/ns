"""Objective stack projection construction over Graphite branch graphs."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_core.git.git_gateway import GitGateway
from asdl_core.gt.types import GtBranchGraph, GtTrackedBranch
from asdl_objectives.gt.models import (
    ObjectiveGtLatestWork,
    ObjectiveGtStackObjective,
    ObjectiveGtStackRow,
    ObjectiveGtStackSegment,
    ObjectiveGtStacksResult,
    ObjectiveGtStackStatus,
)
from asdl_objectives.gt.touches import (
    ObjectiveBranchTouch,
    ObjectiveBranchTouchIndex,
    build_objective_branch_touch_index,
    build_objective_trunk_status_index,
    objective_branch_touch_order_key,
)
from asdl_objectives.list_branch_inventory import ObjectiveRecordStatus


@dataclass(frozen=True)
class BranchGraphView:
    graph: GtBranchGraph
    branch_by_name: dict[str, GtTrackedBranch]
    graph_index: dict[str, int]
    children_by_parent: dict[str, tuple[str, ...]]


def build_branch_graph_view(graph: GtBranchGraph) -> BranchGraphView:
    branch_by_name = {branch.name: branch for branch in graph.branches}
    graph_index = {branch.name: index for index, branch in enumerate(graph.branches)}
    children_by_parent = _children_by_parent(graph.branches, branch_by_name, graph_index)
    return BranchGraphView(
        graph=graph,
        branch_by_name=branch_by_name,
        graph_index=graph_index,
        children_by_parent=children_by_parent,
    )


def build_objective_stack_projection(
    git: GitGateway,
    graph: GtBranchGraph,
) -> ObjectiveGtStacksResult:
    touch_index = build_objective_branch_touch_index(git, graph)
    trunk_statuses = build_objective_trunk_status_index(git, graph.trunk)
    return _build_projection_from_indexes(
        graph=graph,
        touch_index=touch_index,
        trunk_statuses=trunk_statuses,
    )


def _build_projection_from_indexes(
    *,
    graph: GtBranchGraph,
    touch_index: ObjectiveBranchTouchIndex,
    trunk_statuses: dict[str, ObjectiveRecordStatus],
) -> ObjectiveGtStacksResult:
    view = build_branch_graph_view(graph)
    warnings = list(graph.warnings)
    projection_warnings: set[str] = set()

    objectives = tuple(
        _build_group(
            slug=slug,
            view=view,
            touch_index=touch_index,
            trunk_statuses=trunk_statuses,
            warnings=warnings,
            projection_warnings=projection_warnings,
        )
        for slug in _touched_slugs(touch_index)
    )
    return ObjectiveGtStacksResult(
        trunk_branch=graph.trunk,
        warnings=tuple(warnings),
        objectives=objectives,
    )


def _build_group(
    *,
    slug: str,
    view: BranchGraphView,
    touch_index: ObjectiveBranchTouchIndex,
    trunk_statuses: dict[str, ObjectiveRecordStatus],
    warnings: list[str],
    projection_warnings: set[str],
) -> ObjectiveGtStackObjective:
    touched = _branches_touching_slug(touch_index, slug)
    included = _included_branches_for_slug(
        slug=slug,
        touched=touched,
        view=view,
        warnings=warnings,
        projection_warnings=projection_warnings,
    )
    segments = _segments_for_included_branches(
        group_slug=slug,
        included=included,
        touched=touched,
        view=view,
        touch_index=touch_index,
    )
    latest_touch = _latest_touch_for_slug(touch_index, slug, touched)
    return ObjectiveGtStackObjective(
        slug=slug,
        status=_status_for_slug(slug, trunk_statuses),
        objective_branch_count=len(touched),
        segment_count=len(segments),
        latest_work=_latest_work_from_touch(latest_touch),
        segments=segments,
    )


def _latest_work_from_touch(
    latest_touch: ObjectiveBranchTouch | None,
) -> ObjectiveGtLatestWork | None:
    if latest_touch is None:
        return None
    return ObjectiveGtLatestWork(
        branch=latest_touch.branch,
        committed_iso=latest_touch.committed_iso,
        oid=latest_touch.oid,
    )


def _touched_slugs(touch_index: ObjectiveBranchTouchIndex) -> tuple[str, ...]:
    slugs: set[str] = set()
    for summary in touch_index.summaries_by_branch.values():
        slugs.update(summary.touched_slugs)
    return tuple(sorted(slugs))


def _branches_touching_slug(
    touch_index: ObjectiveBranchTouchIndex,
    slug: str,
) -> frozenset[str]:
    return frozenset(
        branch
        for branch, summary in touch_index.summaries_by_branch.items()
        if slug in summary.latest_touch_by_slug
    )


def _included_branches_for_slug(
    *,
    slug: str,
    touched: frozenset[str],
    view: BranchGraphView,
    warnings: list[str],
    projection_warnings: set[str],
) -> frozenset[str]:
    included: set[str] = set()
    for branch in sorted(
        touched, key=lambda name: view.graph_index.get(name, len(view.graph_index))
    ):
        included.add(branch)
        _include_non_trunk_ancestors(
            slug=slug,
            branch=branch,
            included=included,
            view=view,
            warnings=warnings,
            projection_warnings=projection_warnings,
        )
    return frozenset(included)


def _include_non_trunk_ancestors(
    *,
    slug: str,
    branch: str,
    included: set[str],
    view: BranchGraphView,
    warnings: list[str],
    projection_warnings: set[str],
) -> None:
    current = branch
    seen = {branch}
    while current in view.branch_by_name:
        parent = view.branch_by_name[current].parent
        if parent is None:
            if current != view.graph.trunk:
                _append_projection_warning(
                    warnings,
                    projection_warnings,
                    (
                        f"Objective {slug!r}: branch {current!r} has no Graphite parent; "
                        "ancestor walk stopped."
                    ),
                )
            return
        if parent == view.graph.trunk:
            return
        if parent in seen:
            _append_projection_warning(
                warnings,
                projection_warnings,
                (
                    f"Objective {slug!r}: cycle detected at Graphite parent {parent!r}; "
                    "ancestor walk stopped."
                ),
            )
            return
        if parent not in view.branch_by_name:
            _append_projection_warning(
                warnings,
                projection_warnings,
                (
                    f"Objective {slug!r}: branch {current!r} references missing "
                    f"Graphite parent {parent!r}; ancestor walk stopped."
                ),
            )
            return
        included.add(parent)
        seen.add(parent)
        current = parent


def _segments_for_included_branches(
    *,
    group_slug: str,
    included: frozenset[str],
    touched: frozenset[str],
    view: BranchGraphView,
    touch_index: ObjectiveBranchTouchIndex,
) -> tuple[ObjectiveGtStackSegment, ...]:
    components = _connected_components(
        included=included,
        view=view,
    )
    return tuple(
        ObjectiveGtStackSegment(
            index=index,
            rows=_ordered_rows_for_component(
                group_slug=group_slug,
                component=component,
                touched=touched,
                view=view,
                touch_index=touch_index,
            ),
        )
        for index, component in enumerate(components, start=1)
    )


def _connected_components(
    *,
    included: frozenset[str],
    view: BranchGraphView,
) -> tuple[frozenset[str], ...]:
    remaining = set(included)
    components: list[frozenset[str]] = []
    while remaining:
        start = min(remaining, key=lambda name: view.graph_index.get(name, len(view.graph_index)))
        component: set[str] = set()
        stack = [start]
        while stack:
            branch = stack.pop()
            if branch not in remaining:
                continue
            remaining.remove(branch)
            component.add(branch)
            stack.extend(
                neighbor for neighbor in _neighbors(branch, included, view) if neighbor in remaining
            )
        components.append(frozenset(component))
    return tuple(
        sorted(
            components,
            key=lambda component: min(
                view.graph_index.get(name, len(view.graph_index)) for name in component
            ),
        )
    )


def _neighbors(
    branch: str,
    included: frozenset[str],
    view: BranchGraphView,
) -> tuple[str, ...]:
    neighbors: list[str] = []
    parent = view.branch_by_name[branch].parent
    if parent in included:
        neighbors.append(parent)
    neighbors.extend(
        child for child in view.children_by_parent.get(branch, ()) if child in included
    )
    return tuple(neighbors)


def _ordered_rows_for_component(
    *,
    group_slug: str,
    component: frozenset[str],
    touched: frozenset[str],
    view: BranchGraphView,
    touch_index: ObjectiveBranchTouchIndex,
) -> tuple[ObjectiveGtStackRow, ...]:
    rows: list[ObjectiveGtStackRow] = []
    visited: set[str] = set()
    roots = _component_roots(component, view)
    for root in roots:
        _append_preorder_rows(
            group_slug=group_slug,
            branch=root,
            depth=0,
            component=component,
            touched=touched,
            view=view,
            touch_index=touch_index,
            visited=visited,
            rows=rows,
        )
    for branch in sorted(
        component.difference(visited),
        key=lambda name: view.graph_index.get(name, len(view.graph_index)),
    ):
        _append_preorder_rows(
            group_slug=group_slug,
            branch=branch,
            depth=0,
            component=component,
            touched=touched,
            view=view,
            touch_index=touch_index,
            visited=visited,
            rows=rows,
        )
    return tuple(rows)


def _component_roots(
    component: frozenset[str],
    view: BranchGraphView,
) -> tuple[str, ...]:
    roots = tuple(
        branch for branch in component if view.branch_by_name[branch].parent not in component
    )
    if roots:
        return tuple(
            sorted(roots, key=lambda name: view.graph_index.get(name, len(view.graph_index)))
        )
    return (min(component, key=lambda name: view.graph_index.get(name, len(view.graph_index))),)


def _append_preorder_rows(
    *,
    group_slug: str,
    branch: str,
    depth: int,
    component: frozenset[str],
    touched: frozenset[str],
    view: BranchGraphView,
    touch_index: ObjectiveBranchTouchIndex,
    visited: set[str],
    rows: list[ObjectiveGtStackRow],
) -> None:
    if branch in visited:
        return
    visited.add(branch)
    rows.append(
        _branch_row(
            group_slug=group_slug,
            branch=branch,
            depth=depth,
            touched=touched,
            view=view,
            touch_index=touch_index,
        )
    )
    for child in view.children_by_parent.get(branch, ()):
        if child in component:
            _append_preorder_rows(
                group_slug=group_slug,
                branch=child,
                depth=depth + 1,
                component=component,
                touched=touched,
                view=view,
                touch_index=touch_index,
                visited=visited,
                rows=rows,
            )


def _branch_row(
    *,
    group_slug: str,
    branch: str,
    depth: int,
    touched: frozenset[str],
    view: BranchGraphView,
    touch_index: ObjectiveBranchTouchIndex,
) -> ObjectiveGtStackRow:
    summary = touch_index.summaries_by_branch.get(branch)
    touched_slugs = summary.touched_slugs if summary is not None else ()
    tracked_branch = view.branch_by_name[branch]
    return ObjectiveGtStackRow(
        branch=branch,
        parent=tracked_branch.parent,
        depth=depth,
        touches_objective=branch in touched,
        also_touches=tuple(slug for slug in touched_slugs if slug != group_slug),
        validation_result=tracked_branch.validation_result,
        needs_restack=tracked_branch.needs_restack,
    )


def _children_by_parent(
    branches: tuple[GtTrackedBranch, ...],
    branch_by_name: dict[str, GtTrackedBranch],
    graph_index: dict[str, int],
) -> dict[str, tuple[str, ...]]:
    children_by_parent: dict[str, tuple[str, ...]] = {}
    for branch in branches:
        ordered_children = [child for child in branch.children if child in branch_by_name]
        inferred_children = sorted(
            (
                candidate.name
                for candidate in branches
                if candidate.parent == branch.name and candidate.name not in ordered_children
            ),
            key=lambda name: graph_index.get(name, len(graph_index)),
        )
        children_by_parent[branch.name] = tuple(ordered_children + inferred_children)
    return children_by_parent


def _latest_touch_for_slug(
    touch_index: ObjectiveBranchTouchIndex,
    slug: str,
    touched: frozenset[str],
) -> ObjectiveBranchTouch | None:
    touches: list[ObjectiveBranchTouch] = []
    for branch in touched:
        summary = touch_index.summaries_by_branch.get(branch)
        if summary is None:
            continue
        touch = summary.latest_touch_by_slug.get(slug)
        if touch is not None:
            touches.append(touch)
    if not touches:
        return None
    return max(touches, key=objective_branch_touch_order_key)


def _status_for_slug(
    slug: str,
    trunk_statuses: dict[str, ObjectiveRecordStatus],
) -> ObjectiveGtStackStatus:
    status = trunk_statuses.get(slug)
    if status is None:
        return "in-flight"
    return status


def _append_projection_warning(
    warnings: list[str],
    projection_warnings: set[str],
    message: str,
) -> None:
    if message in projection_warnings:
        return
    projection_warnings.add(message)
    warnings.append(message)
