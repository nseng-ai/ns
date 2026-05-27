"""``objective gt stacks`` command implementation."""

from __future__ import annotations

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.git_gateway import GitGateway
from asdl_core.gt.types import GtBranchGraph, GtCommandFailure, GtTrackedBranch
from asdl_objectives.context import ObjectiveCliUnavailable
from asdl_objectives.gt.context import load_objective_gt_context
from asdl_objectives.gt.models import (
    ObjectiveGtStacksRequest,
    ObjectiveGtStacksResult,
    result_from_projection,
)
from asdl_objectives.gt.render import (
    render_objective_gt_stacks_human,
    render_objective_gt_stacks_markdown,
)
from asdl_objectives.gt_stack_projection import build_objective_stack_projection


@clinkr_operation(
    name="stacks",
    help="Show Objective work across Graphite-tracked branches.",
    human_renderer=render_objective_gt_stacks_human,
    markdown_renderer=render_objective_gt_stacks_markdown,
)
def run_objective_gt_stacks(
    ctx: click.Context,
    request: ObjectiveGtStacksRequest,
) -> ClinkrExit[ObjectiveGtStacksResult]:
    objective_gt_ctx = load_objective_gt_context(ctx)
    if isinstance(objective_gt_ctx, ObjectiveCliUnavailable):
        return ClinkrExit.failure(error_type="not_in_repo", message=objective_gt_ctx.message)

    graph = objective_gt_ctx.gt.branch_graph(objective_gt_ctx.objective.repo_root)
    if isinstance(graph, GtCommandFailure):
        return ClinkrExit.failure(
            error_type="gt_branch_graph_failed",
            message=f"Graphite branch graph failed: {graph.message}",
        )

    local_graph = _local_branch_graph(objective_gt_ctx.objective.git, graph)
    return ClinkrExit.ok(
        result_from_projection(
            build_objective_stack_projection(
                objective_gt_ctx.objective.git,
                local_graph,
            )
        )
    )


def _local_branch_graph(git: GitGateway, graph: GtBranchGraph) -> GtBranchGraph:
    branch_by_name = {branch.name: branch for branch in graph.branches}
    local_branches = set(git.list_local_branches())
    eligible = {graph.trunk}
    warnings = list(graph.warnings)

    for branch in graph.branches:
        if branch.name == graph.trunk:
            continue
        if branch.name in local_branches:
            eligible.add(branch.name)

    included = _connected_local_branches(graph, eligible)
    for branch_name in sorted(eligible.difference(included)):
        warnings.append(
            f"Graphite branch {branch_name!r} has unavailable local parent "
            f"{branch_by_name[branch_name].parent!r}; skipping."
        )

    return GtBranchGraph(
        trunk=graph.trunk,
        branches=tuple(
            _filter_branch_children(branch, included)
            for branch in graph.branches
            if branch.name in included
        ),
        warnings=tuple(warnings),
    )


def _connected_local_branches(graph: GtBranchGraph, eligible: set[str]) -> frozenset[str]:
    included = {graph.trunk}
    unresolved = set(eligible)
    unresolved.discard(graph.trunk)

    made_progress = True
    while made_progress:
        made_progress = False
        for branch in graph.branches:
            if branch.name not in unresolved:
                continue
            if branch.parent not in included:
                continue
            included.add(branch.name)
            unresolved.remove(branch.name)
            made_progress = True

    return frozenset(included)


def _filter_branch_children(branch: GtTrackedBranch, included: frozenset[str]) -> GtTrackedBranch:
    return GtTrackedBranch(
        name=branch.name,
        parent=branch.parent,
        children=tuple(child for child in branch.children if child in included),
        validation_result=branch.validation_result,
        needs_restack=branch.needs_restack,
    )
